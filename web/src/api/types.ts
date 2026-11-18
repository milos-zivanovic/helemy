import type { components } from './schema'

// Short names for the API's models (the serializers' output), generated from the OpenAPI schema.
type Schemas = components['schemas']

export type User = Schemas['User']
export type Household = Schemas['Household']
export type HouseholdInvitation = Schemas['HouseholdInvitation']
