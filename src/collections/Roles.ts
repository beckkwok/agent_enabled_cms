import type { CollectionConfig } from 'payload'

import { adminCollectionAccess } from './helpers/access'

export const Roles: CollectionConfig = {
  slug: 'roles',
  admin: {
    useAsTitle: 'name',
    group: 'Framework',
    defaultColumns: ['name', 'description', 'updatedAt'],
  },
  access: adminCollectionAccess,
  fields: [
    {
      name: 'name',
      type: 'text',
      required: true,
      unique: true,
      index: true,
    },
    {
      name: 'description',
      type: 'textarea',
    },
  ],
}
