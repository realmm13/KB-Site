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
  const title = item.title || '';
  // Detect podcast episodes by headphone emoji or "Episode" pattern in title
  return (
    title.includes('🎧') ||
    /episode\s*\d/i.test(title) ||
    /^\d+\.\s/.test(title) // Matches "1. Episode title" format
  );
}

function hasImageEnclosure(item: CustomItem): boolean {
  return !!(
    item.enclosure &&
    item.enclosure.type &&
    item.enclosure.type.startsWith('image/')
  );
}

function extractImageFromContent(content: string): string | undefined {
  // Try to find the first substantial image (not a tiny icon/gif)
  const imgMatches = content.matchAll(/<img[^>]+src="([^"]+)"/g);
  for (const match of imgMatches) {
    const url = match[1];
    // Skip tiny images, gifs, and icons
    if (url && !url.includes('_48x') && !url.includes('_24x')) {
      return url;
    }
  }
  return undefined;
}

function getImageForPost(item: CustomItem): string | undefined {
  // Priority 1: Image enclosure (Substack thumbnail)
  if (hasImageEnclosure(item) && item.enclosure?.url) {
    return item.enclosure.url;
  }

  // Priority 2: Extract from content
  if (item.content) {
    return extractImageFromContent(item.content);
  }

  return undefined;
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
    image: getImageForPost(item),
  };
}

function transformToPodcast(item: CustomItem): PodcastEpisode {
  // Clean up title - remove emoji prefix
  let title = item.title || 'Untitled Episode';
  title = title.replace(/^🎧\s*/, '').trim();

  return {
    title,
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

// Static podcast episodes (from 2023, not in main RSS feed)
const STATIC_PODCASTS: PodcastEpisode[] = [
  {
    title: 'Maintaining Awe and Wonder with Sara Kaiser',
    link: 'https://stillsmall.substack.com/p/7-maintaining-awe-and-wonder',
    pubDate: '2023-10-18',
    excerpt: 'A conversation exploring nature\'s significance, intuitive listening, imagination and creativity.',
    duration: '61 min',
  },
  {
    title: 'The Unconventional Route with Chris Blachut',
    link: 'https://stillsmall.substack.com/p/6-the-unconventional-route',
    pubDate: '2023-09-27',
    excerpt: 'Exploring the path less traveled and creating your own route in life.',
    duration: '55 min',
  },
  {
    title: 'Creativity and Connection with Rachael Maier',
    link: 'https://stillsmall.substack.com/p/episode-5-creativity-and-connection',
    pubDate: '2023-09-13',
    excerpt: 'A discussion about the intersection of creativity and human connection.',
    duration: '52 min',
  },
  {
    title: 'Prioritizing Relationships with Jason Lakis',
    link: 'https://stillsmall.substack.com/p/episode-4-prioritizing-relationships',
    pubDate: '2023-08-30',
    excerpt: 'How to put relationships first in a world that prioritizes productivity.',
    duration: '48 min',
  },
  {
    title: 'Middle School Feelings with Rachel',
    link: 'https://stillsmall.substack.com/p/episode-3-middle-school-feelings',
    pubDate: '2023-08-16',
    excerpt: 'Revisiting the emotions and experiences of middle school years.',
    duration: '45 min',
  },
  {
    title: 'Mother-Daughter Relationships with Elise Porter',
    link: 'https://stillsmall.substack.com/p/episode-2-mother-daughter-relationships',
    pubDate: '2023-08-02',
    excerpt: 'Exploring the complex and beautiful bond between mothers and daughters.',
    duration: '50 min',
  },
  {
    title: 'The Decision to Have Children with Allison Doering',
    link: 'https://stillsmall.substack.com/p/episode-1-the-decision-to-have-children',
    pubDate: '2023-07-19',
    excerpt: 'A thoughtful conversation about the decision to become a parent.',
    duration: '47 min',
  },
];

export async function getPodcasts(): Promise<PodcastEpisode[]> {
  // First try to get podcasts from RSS feed (in case new ones are added)
  const items = await fetchSubstackFeed();
  const rssEpisodes = items
    .filter(isPodcastEpisode)
    .map(transformToPodcast);

  // Combine RSS episodes with static ones, avoiding duplicates
  const allEpisodes = [...rssEpisodes];
  for (const staticEp of STATIC_PODCASTS) {
    if (!allEpisodes.some(ep => ep.link === staticEp.link)) {
      allEpisodes.push(staticEp);
    }
  }

  // Sort by date (newest first)
  return allEpisodes.sort((a, b) =>
    new Date(b.pubDate).getTime() - new Date(a.pubDate).getTime()
  );
}

export async function getLatestPosts(count = 6): Promise<SubstackPost[]> {
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
