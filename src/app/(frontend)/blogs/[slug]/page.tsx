import type { Metadata } from 'next'
import { ArrowLeft, ArrowRight, Calendar, Clock } from 'lucide-react'
import Image from 'next/image'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import React from 'react'

import { RichText } from '@/components/RichText'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { lexicalToPlainText } from '@/lib/lexical'
import { getPostBySlug, getPublishedPosts } from '@/lib/site-data'
import { absoluteUrl, extractTags, siteConfig } from '@/lib/site'

export const dynamic = 'force-dynamic'

function formatDate(date: string) {
  return new Date(date).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
}

function readingTime(content: unknown): number {
  const text = lexicalToPlainText(content)
  const words = text.split(/\s+/).filter(Boolean).length
  return Math.max(1, Math.round(words / 200))
}

type PageProps = {
  params: Promise<{ slug: string }>
  searchParams: Promise<{ preview?: string }>
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params
  const post = await getPostBySlug(slug)
  if (!post) return {}

  const cover = post.coverImage && typeof post.coverImage !== 'number' ? post.coverImage : null
  const tags = extractTags(post.tags)

  return {
    title: post.title,
    description: post.excerpt || undefined,
    robots: { index: false, follow: false },
    alternates: { canonical: absoluteUrl(`/blogs/${post.slug}`) },
    openGraph: {
      title: post.title,
      description: post.excerpt || undefined,
      type: 'article',
      url: absoluteUrl(`/blogs/${post.slug}`),
      siteName: siteConfig.name,
      publishedTime: post.publishedDate || undefined,
      modifiedTime: post.updatedAt || undefined,
      tags,
      images: cover?.url ? [{ url: absoluteUrl(cover.url), alt: cover.alt || post.title }] : [],
    },
    twitter: {
      card: 'summary_large_image',
      title: post.title,
      description: post.excerpt || undefined,
      images: cover?.url ? [absoluteUrl(cover.url)] : [],
    },
  }
}

export default async function BlogPostPage({ params, searchParams }: PageProps) {
  const { slug } = await params
  const { preview } = await searchParams
  const isPreview = preview === 'true'
  const post = await getPostBySlug(slug, { draft: isPreview })

  if (!post) notFound()

  const tags = extractTags(post.tags)
  const cover = post.coverImage && typeof post.coverImage !== 'number' ? post.coverImage : null
  const minutes = readingTime(post.content)

  // Prev/next navigation over published posts
  const { docs: allPosts } = await getPublishedPosts(200)
  const index = allPosts.findIndex((p) => p.slug === post.slug)
  const prevPost = index > 0 ? allPosts[index - 1] : null
  const nextPost = index >= 0 && index < allPosts.length - 1 ? allPosts[index + 1] : null

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'BlogPosting',
    headline: post.title,
    description: post.excerpt || undefined,
    datePublished: post.publishedDate || post.createdAt,
    dateModified: post.updatedAt,
    url: absoluteUrl(`/blogs/${post.slug}`),
    author: { '@type': 'Person', name: siteConfig.author },
    ...(cover?.url
      ? { image: absoluteUrl(cover.url) }
      : {}),
  }

  return (
    <article className="mx-auto max-w-3xl px-4 py-12 sm:px-6 sm:py-16">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

      {isPreview && (
        <div className="mb-8 flex items-center gap-2 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/50 dark:text-amber-200">
          <span className="font-medium">Draft preview</span> — this post is not published.
        </div>
      )}

      <Button asChild variant="ghost" size="sm" className="-ml-3 mb-8 text-muted-foreground">
        <Link href="/blogs">
          <ArrowLeft className="size-4" /> All posts
        </Link>
      </Button>

      <h1 className="text-3xl font-bold tracking-tight sm:text-5xl">{post.title}</h1>

      <div className="mt-6 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-muted-foreground">
        {post.publishedDate && (
          <span className="flex items-center gap-1.5">
            <Calendar className="size-4" /> {formatDate(post.publishedDate)}
          </span>
        )}
        <span className="flex items-center gap-1.5">
          <Clock className="size-4" /> {minutes} min read
        </span>
        {tags.map((tag) => (
          <Badge key={tag} variant="secondary" className="font-normal">
            <Link href={`/blogs/tags/${encodeURIComponent(tag)}`} className="hover:underline">
              {tag}
            </Link>
          </Badge>
        ))}
      </div>

      {cover?.url && (
        <div className="mt-8 overflow-hidden rounded-xl border">
          <Image
            src={cover.url}
            alt={cover.alt || post.title}
            width={cover.width || 1200}
            height={cover.height || 630}
            className="h-auto w-full"
            unoptimized={cover.url.startsWith('/api/')}
          />
        </div>
      )}

      <Separator className="my-8" />

      <div className="typeset typeset-docs max-w-[42em]">
        <RichText content={post.content} />
      </div>

      {(prevPost || nextPost) && (
        <div className="mt-16 grid gap-4 border-t pt-8 sm:grid-cols-2">
          {prevPost ? (
            <Link href={`/blogs/${prevPost.slug}`} className="group flex flex-col gap-1 rounded-lg border p-4 transition-colors hover:border-foreground/30">
              <span className="flex items-center gap-1 text-xs text-muted-foreground">
                <ArrowLeft className="size-3.5" /> Previous
              </span>
              <span className="font-medium group-hover:underline">{prevPost.title}</span>
            </Link>
          ) : (
            <span />
          )}
          {nextPost && (
            <Link href={`/blogs/${nextPost.slug}`} className="group flex flex-col gap-1 rounded-lg border p-4 text-right transition-colors hover:border-foreground/30">
              <span className="flex items-center justify-end gap-1 text-xs text-muted-foreground">
                Next <ArrowRight className="size-3.5" />
              </span>
              <span className="font-medium group-hover:underline">{nextPost.title}</span>
            </Link>
          )}
        </div>
      )}
    </article>
  )
}
