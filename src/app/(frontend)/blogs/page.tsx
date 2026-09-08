import { ArrowRight, ChevronLeft, ChevronRight, FileText } from 'lucide-react'
import Image from 'next/image'
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
import { getPublishedPosts } from '@/lib/site-data'
import { extractTags } from '@/lib/site'

export const dynamic = 'force-dynamic'

const PAGE_SIZE = 9

function formatDate(date: string) {
  return new Date(date).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

type PageProps = { searchParams: Promise<{ page?: string }> }

export default async function BlogsPage({ searchParams }: PageProps) {
  const { page: pageParam } = await searchParams
  const page = Math.max(1, Number(pageParam) || 1)
  const { docs: posts, totalPages, page: currentPageRaw, totalDocs } = await getPublishedPosts(PAGE_SIZE, page)
  const currentPage = currentPageRaw ?? page

  return (
    <div className="mx-auto max-w-5xl px-4 py-16 sm:px-6 sm:py-24">
      <div className="mb-10">
        <Badge variant="secondary" className="mb-6">
          Blogs
        </Badge>
        <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">Blogs</h1>
        <p className="mt-4 max-w-2xl text-lg text-muted-foreground">
          Notes, essays, and project write-ups. Read on, and if you have questions, try asking
          the chat bot in the corner.
        </p>
      </div>

      {posts.length === 0 ? (
        <p className="text-muted-foreground">No posts yet.</p>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2">
            {posts.map((post) => {
              const cover =
                post.coverImage && typeof post.coverImage !== 'number' ? post.coverImage : null
              return (
                <Card key={post.id} className="overflow-hidden transition-colors hover:border-foreground/25">
                  {cover?.url && (
                    <Link href={`/blogs/${post.slug}`} className="block">
                      <div className="relative aspect-[16/9] w-full bg-muted">
                        <Image
                          src={cover.url}
                          alt={cover.alt || post.title}
                          fill
                          sizes="(max-width: 768px) 100vw, 50vw"
                          className="object-cover"
                          unoptimized={cover.url.startsWith('/api/')}
                        />
                      </div>
                    </Link>
                  )}
                  <CardHeader>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <FileText className="size-3.5" />
                      {post.publishedDate && <span>{formatDate(post.publishedDate)}</span>}
                      {post.tags?.length
                        ? extractTags(post.tags)
                            .slice(0, 3)
                            .map((tag) => (
                              <Badge key={tag} variant="secondary" className="font-normal">
                                <Link href={`/blogs/tags/${encodeURIComponent(tag)}`} className="hover:underline">
                                  {tag}
                                </Link>
                              </Badge>
                            ))
                        : null}
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
              )
            })}
          </div>

          {totalPages > 1 && (
            <div className="mt-10 flex items-center justify-between gap-4">
              <Button asChild variant="outline" size="sm" disabled={currentPage <= 1}>
                {currentPage > 1 ? (
                  <Link href={`/blogs?page=${currentPage - 1}`}>
                    <ChevronLeft className="size-4" /> Previous
                  </Link>
                ) : (
                  <span className="inline-flex items-center gap-1">
                    <ChevronLeft className="size-4" /> Previous
                  </span>
                )}
              </Button>
              <span className="text-sm text-muted-foreground">
                Page {currentPage} of {totalPages} · {totalDocs} posts
              </span>
              <Button asChild variant="outline" size="sm" disabled={currentPage >= totalPages}>
                {currentPage < totalPages ? (
                  <Link href={`/blogs?page=${currentPage + 1}`}>
                    Next <ChevronRight className="size-4" />
                  </Link>
                ) : (
                  <span className="inline-flex items-center gap-1">
                    Next <ChevronRight className="size-4" />
                  </span>
                )}
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  )
}
