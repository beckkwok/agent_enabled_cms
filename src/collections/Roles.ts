import type { CollectionConfig } from 'payload'

import { adminCollectionAccess, PERMISSIONS } from './helpers/access'

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
    {
      name: 'permissions',
      type: 'select',
      hasMany: true,
      defaultValue: [],
      options: PERMISSIONS.map((permission) => ({ label: permission, value: permission })),
      admin: {
        description:
          'What this role grants. Used by collection access rules via `requirePermission`. Admins always have full access.',
      },
    },
  ],
}
