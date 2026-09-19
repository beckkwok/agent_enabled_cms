import type { CollectionConfig } from 'payload'

import { requirePermission } from './helpers/access'

export const Media: CollectionConfig = {
  slug: 'media',
  access: {
    // Read is public; writes require the `content.write` permission.
    create: requirePermission('content.write'),
    read: () => true,
    update: requirePermission('content.write'),
    delete: requirePermission('content.write'),
  },
  fields: [
    {
      name: 'alt',
      type: 'text',
      required: true,
    },
  ],
  upload: true,
}
