import { useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'

import { api } from '../api/client'
import { unwrap } from '../api/errors'
import { Avatar } from '../components/Avatar'
import { ImageEditor } from '../components/ImageEditor'
import { fileFormData } from '../lib/formData'
import { ME_QUERY_KEY, useMe } from './useAuth'

// The profile picture on the profile page: PUT / DELETE /api/auth/me/avatar/.
export function AvatarEditor() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const { data: me } = useMe()
  if (!me) return null

  // The answer is the whole profile: into the cache, so the menu shows the new picture at once.
  const save = (profile: typeof me) => queryClient.setQueryData(ME_QUERY_KEY, profile)

  return (
    <ImageEditor
      round
      hasImage={Boolean(me.avatar_url)}
      preview={
        <Avatar
          firstName={me.first_name}
          lastName={me.last_name}
          email={me.email}
          src={me.avatar_url}
          className="size-20 text-2xl"
        />
      }
      labels={{
        upload: t('profile.avatar.upload'),
        change: t('profile.avatar.change'),
        remove: t('profile.avatar.remove'),
        removeConfirm: t('profile.avatar.removeConfirm'),
      }}
      upload={async (blob) =>
        save(
          unwrap(
            await api.PUT('/api/auth/me/avatar/', {
              // The schema types the file as a string (OpenAPI "binary"); the real value is the
              // Blob, sent as multipart/form-data: bodySerializer replaces the default JSON.
              body: { avatar: '' },
              bodySerializer: () => fileFormData('avatar', blob),
            }),
          ),
        )
      }
      remove={async () => save(unwrap(await api.DELETE('/api/auth/me/avatar/')))}
    />
  )
}
