import { ArrowRight, ArrowUpLeft } from 'lucide-react'
import Link from 'next/link'
import React from 'react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { getPostsByTag } from '@/lib/site-data'

export const dynamic = 'force-dynamic'

function formatDate(date: string) {
  return new Date(date).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

type PageProps = { params: Promise<{ tag: string }> }

export default async function TagPage({ params }: PageProps) {
  const { tag } = await params
  const decoded = decodeURIComponent(tag)
  const posts = await getPostsByTag(decoded)

  return (
    <div className="mx-auto max-w-5xl px-4 py-16 sm:px-6 sm:py-24">
      <Button asChild variant="ghost" size="sm" className="-ml-3 mb-6 text-muted-foreground">
        <Link href="/blogs">
          <ArrowUpLeft className="size-4" /> All posts
        </Link>
      </Button>

      <div className="mb-10">
        <Badge variant="secondary" className="mb-6">
          Tag
        </Badge>
        <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">#{decoded}</h1>
        <p className="mt-4 text-lg text-muted-foreground">
          {posts.length} post{posts.length === 1 ? '' : 's'} tagged {decoded}.
        </p>
      </div>

      {posts.length === 0 ? (
        <p className="text-muted-foreground">No posts with this tag yet.</p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {posts.map((post) => (
            <Card key={post.id} className="transition-colors hover:border-foreground/25">
              <CardHeader>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  {post.publishedDate && <span>{formatDate(post.publishedDate)}</span>}
                </div>
                <CardTitle className="text-xl leading-snug">
                  <Link href={`/blogs/${post.slug}`} className="hover:underline">
                    {post.title}
                  </Link>
                </CardTitle>
              </CardHeader>
              {post.excerpt && (
                <CardContent className="pt-0">
                  <CardDescription className="line-clamp-2">{post.excerpt}</CardDescription>
                </CardContent>
              )}
              <CardFooter>
                <Button asChild variant="ghost" size="sm" className="px-0">
                  <Link href={`/blogs/${post.slug}`}>
                    Read post <ArrowRight className="size-4" />
                  </Link>
                </Button>
              </CardFooter>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
