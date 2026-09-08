import type { CollectionConfig } from 'payload'

import { publicCollectionAccess } from './helpers/access'
import { autoPublishDate } from './hooks/autoPublishDate'

export const BlogPosts: CollectionConfig = {
  slug: 'blog-posts',
  admin: {
    useAsTitle: 'title',
    defaultColumns: ['title', 'published', 'publishedDate', 'updatedAt'],
    preview: (doc) => {
      const slug = doc?.slug as string | undefined
      return slug ? `${process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'}/blogs/${slug}?preview=true` : null
    },
  },
  access: publicCollectionAccess,
  hooks: {
    beforeChange: [autoPublishDate],
  },
  versions: {
    drafts: true,
    maxPerDoc: 20,
  },
  fields: [
    {
      name: 'title',
      type: 'text',
      required: true,
    },
    {
      name: 'slug',
      type: 'text',
      required: true,
      unique: true,
      index: true,
      admin: {
        description: 'URL path, e.g. my-first-post',
      },
    },
    {
      name: 'excerpt',
      type: 'textarea',
    },
    {
      name: 'coverImage',
      type: 'upload',
      relationTo: 'media',
    },
    {
      name: 'author',
      type: 'relationship',
      relationTo: 'users',
    },
    {
      name: 'published',
      type: 'checkbox',
      defaultValue: false,
      index: true,
    },
    {
      name: 'publishedDate',
      type: 'date',
      admin: {
        date: {
          pickerAppearance: 'dayAndTime',
        },
      },
    },
    {
      name: 'tags',
      type: 'array',
      fields: [
        {
          name: 'tag',
          type: 'text',
        },
      ],
    },
    {
      name: 'content',
      type: 'richText',
      required: true,
    },
  ],
}