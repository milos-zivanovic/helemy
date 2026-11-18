import { type QueryClient, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { api } from '../api/client'
import { unwrap } from '../api/errors'
import { ME_QUERY_KEY, useMe } from '../auth/useAuth'

// Data hooks for the household page. Queries read (GET), mutations write (POST/PATCH/DELETE).
//
// Query keys name the cached data, like cache keys in Django's cache framework. After a write, the
// mutation "invalidates" the keys whose data it changed: TanStack Query refetches those that are on
// screen and drops the rest, so the page never shows stale data and no code updates it by hand.

const INVITATIONS_KEY = ['invitations'] as const
const membersKey = (householdId: number) => ['households', householdId, 'members'] as const

/** The user's active household. Every user is in exactly one, so it's the only item of me.households. */
export function useActiveHousehold() {
  const { data: me } = useMe()
  return me?.households[0]
}

export function useMembers(householdId: number) {
  return useQuery({
    queryKey: membersKey(householdId),
    queryFn: async () =>
      unwrap(
        await api.GET('/api/auth/households/{id}/members/', {
          params: { path: { id: householdId } },
        }),
      ),
  })
}

/** Pending invitations, split into the ones the user received and the ones they sent (as owner). */
export function useInvitations() {
  const { data: me } = useMe()
  return useQuery({
    queryKey: INVITATIONS_KEY,
    queryFn: async () => unwrap(await api.GET('/api/auth/invitations/')).results,
    // select derives a value from the cached data on every render, without another request.
    select: (invitations) => ({
      received: invitations.filter((invitation) => invitation.invited_user.id === me?.id),
      sent: invitations.filter((invitation) => invitation.invited_user.id !== me?.id),
    }),
    enabled: me !== undefined,
    // Nothing pushes new invitations to the browser, so look every minute (and on returning to the tab).
    refetchInterval: 60_000,
  })
}

export function useRenameHousehold(householdId: number) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (name: string) =>
      unwrap(
        await api.PATCH('/api/auth/households/{id}/', {
          params: { path: { id: householdId } },
          body: { name },
        }),
      ),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ME_QUERY_KEY }), // me.households
  })
}

export function useInviteMember(householdId: number) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (email: string) =>
      unwrap(
        await api.POST('/api/auth/households/{id}/invite/', {
          params: { path: { id: householdId } },
          body: { email },
        }),
      ),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: INVITATIONS_KEY }),
  })
}

export function useCancelInvitation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (invitationId: number) =>
      unwrap(
        await api.DELETE('/api/auth/invitations/{id}/', {
          params: { path: { id: invitationId } },
        }),
      ),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: INVITATIONS_KEY }),
  })
}

export function useDeclineInvitation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (invitationId: number) =>
      unwrap(
        await api.POST('/api/auth/invitations/{id}/decline/', {
          params: { path: { id: invitationId } },
        }),
      ),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: INVITATIONS_KEY }),
  })
}

export function useRemoveMember(householdId: number) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (userId: number) =>
      unwrap(
        await api.DELETE('/api/auth/households/{id}/members/{user_id}/', {
          params: { path: { id: householdId, user_id: String(userId) } },
        }),
      ),
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: membersKey(householdId) }),
        queryClient.invalidateQueries({ queryKey: ME_QUERY_KEY }), // member_count
      ]),
  })
}

// Accepting an invitation or leaving switches the active household, and with it ALL domain data
// (transactions, trainings, ...). First load the new profile (it names the new household), so the
// page switches to it; only then refetch the rest. Refetching everything at once would also ask for
// the members of the old household, which the user no longer belongs to (404).
async function onHouseholdSwitched(queryClient: QueryClient) {
  await queryClient.refetchQueries({ queryKey: ME_QUERY_KEY })
  await queryClient.invalidateQueries({
    predicate: (query) => query.queryKey[0] !== ME_QUERY_KEY[0],
  })
}

export function useAcceptInvitation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (invitationId: number) =>
      unwrap(
        await api.POST('/api/auth/invitations/{id}/accept/', {
          params: { path: { id: invitationId } },
        }),
      ),
    onSuccess: () => onHouseholdSwitched(queryClient),
  })
}

export function useLeaveHousehold(householdId: number) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async () =>
      unwrap(
        await api.POST('/api/auth/households/{id}/leave/', {
          params: { path: { id: householdId } },
        }),
      ),
    onSuccess: () => onHouseholdSwitched(queryClient),
  })
}
