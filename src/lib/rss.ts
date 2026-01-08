import Parser from 'rss-parser';
import type { SubstackPost, PodcastEpisode } from './types';

const RSS_URL = 'https://stillsmall.substack.com/feed';

interface CustomItem {
  title?: string;
  link?: string;
  pubDate?: string;
  content?: string;
  contentSnippet?: string;
  creator?: string;
  enclosure?: {
    url: string;
    type: string;
    length?: string;
  };
  'itunes:duration'?: string;
  'itunes:image'?: { href: string };
}

const parser = new Parser<Record<string, unknown>, CustomItem>({
  customFields: {
    item: [
      ['enclosure', 'enclosure'],
      ['itunes:duration', 'itunes:duration'],
      ['itunes:image', 'itunes:image'],
    ],
  },
});

function isPodcastEpisode(item: CustomItem): boolean {
  return !!(
    item.enclosure &&
    item.enclosure.type &&
    item.enclosure.type.startsWith('audio/')
  );
}

function extractImageFromContent(content: string): string | undefined {
  const imgMatch = content.match(/<img[^>]+src="([^"]+)"/);
  return imgMatch ? imgMatch[1] : undefined;
}

function cleanExcerpt(snippet: string | undefined, maxLength = 200): string {
  if (!snippet) return '';
  const cleaned = snippet.replace(/\s+/g, ' ').trim();
  if (cleaned.length <= maxLength) return cleaned;
  return cleaned.substring(0, maxLength).replace(/\s+\S*$/, '') + '...';
}

function transformToPost(item: CustomItem): SubstackPost {
  return {
    title: item.title || 'Untitled',
    link: item.link || '',
    pubDate: item.pubDate || new Date().toISOString(),
    excerpt: cleanExcerpt(item.contentSnippet),
    content: item.content || '',
    image: extractImageFromContent(item.content || ''),
  };
}

function transformToPodcast(item: CustomItem): PodcastEpisode {
  return {
    title: item.title || 'Untitled Episode',
    link: item.link || '',
    pubDate: item.pubDate || new Date().toISOString(),
    excerpt: cleanExcerpt(item.contentSnippet),
    duration: item['itunes:duration'],
    audioUrl: item.enclosure?.url,
  };
}

export async function fetchSubstackFeed(): Promise<CustomItem[]> {
  try {
    const feed = await parser.parseURL(RSS_URL);
    return feed.items;
  } catch (error) {
    console.error('Error fetching Substack RSS feed:', error);
    return [];
  }
}

export async function getPosts(): Promise<SubstackPost[]> {
  const items = await fetchSubstackFeed();
  return items
    .filter((item) => !isPodcastEpisode(item))
    .map(transformToPost);
}

export async function getPodcasts(): Promise<PodcastEpisode[]> {
  const items = await fetchSubstackFeed();
  return items
    .filter(isPodcastEpisode)
    .map(transformToPodcast);
}

export async function getLatestPosts(count = 3): Promise<SubstackPost[]> {
  const posts = await getPosts();
  return posts.slice(0, count);
}

export async function getLatestPodcasts(count = 3): Promise<PodcastEpisode[]> {
  const podcasts = await getPodcasts();
  return podcasts.slice(0, count);
}

export function formatDate(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}
