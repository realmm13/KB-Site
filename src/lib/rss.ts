import Parser from 'rss-parser';
import type { SubstackPost, PodcastEpisode } from './types';

const RSS_URL = 'https://stillsmall.substack.com/feed';
const SITEMAP_URL = 'https://stillsmall.substack.com/sitemap.xml';

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
    /episode\s*\d/i.test(title)
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

function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&#x27;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#(\d+);/g, (_, dec) => String.fromCharCode(dec));
}

function cleanExcerpt(snippet: string | undefined, maxLength = 200): string {
  if (!snippet) return '';
  const decoded = decodeHtmlEntities(snippet);
  const cleaned = decoded.replace(/\s+/g, ' ').trim();
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

async function fetchSitemapUrls(): Promise<string[]> {
  try {
    const response = await fetch(SITEMAP_URL);
    const xml = await response.text();
    const urls: string[] = [];
    const regex = /<loc>(https:\/\/stillsmall\.substack\.com\/p\/[^<]+)<\/loc>/g;
    let match;
    while ((match = regex.exec(xml)) !== null) {
      urls.push(match[1]);
    }
    return urls;
  } catch (error) {
    console.error('Error fetching sitemap:', error);
    return [];
  }
}

async function fetchPostMetadata(url: string): Promise<SubstackPost | null> {
  try {
    const response = await fetch(url);
    const html = await response.text();

    // Extract title from og:title or title tag
    const titleMatch = html.match(/<meta[^>]*property="og:title"[^>]*content="([^"]+)"/i) ||
                       html.match(/<title>([^<]+)<\/title>/i);
    const title = titleMatch ? titleMatch[1].replace(' - Still Small', '').trim() : 'Untitled';

    // Extract date from article:published_time or datePublished
    const dateMatch = html.match(/<meta[^>]*property="article:published_time"[^>]*content="([^"]+)"/i) ||
                      html.match(/"datePublished"\s*:\s*"([^"]+)"/);
    const pubDate = dateMatch ? dateMatch[1] : new Date().toISOString();

    // Extract description/excerpt
    const descMatch = html.match(/<meta[^>]*property="og:description"[^>]*content="([^"]+)"/i) ||
                      html.match(/<meta[^>]*name="description"[^>]*content="([^"]+)"/i);
    const excerpt = descMatch ? cleanExcerpt(descMatch[1]) : '';

    // Extract image
    const imgMatch = html.match(/<meta[^>]*property="og:image"[^>]*content="([^"]+)"/i);
    const image = imgMatch ? imgMatch[1] : undefined;

    return {
      title,
      link: url,
      pubDate,
      excerpt,
      content: '',
      image,
    };
  } catch (error) {
    console.error(`Error fetching post metadata for ${url}:`, error);
    return null;
  }
}

// URL patterns to exclude (podcasts and non-blog posts)
const EXCLUDED_URL_PATTERNS = [
  '/p/episode-',
  '/p/7-maintaining-awe-and-wonder',
  '/p/6-the-unconventional-route',
  '/p/welcome-to-still-small',
];

function isExcludedUrl(url: string): boolean {
  return EXCLUDED_URL_PATTERNS.some((pattern) => url.includes(pattern));
}

export async function getPosts(): Promise<SubstackPost[]> {
  // Get posts from RSS feed (most recent 20)
  const rssItems = await fetchSubstackFeed();
  const rssPosts = rssItems
    .filter((item) => !isPodcastEpisode(item))
    .map(transformToPost);

  // Get all post URLs from sitemap
  const sitemapUrls = await fetchSitemapUrls();

  // Find URLs not in RSS feed
  const rssUrls = new Set(rssPosts.map((p) => p.link));
  const olderUrls = sitemapUrls.filter(
    (url) => !rssUrls.has(url) && !isExcludedUrl(url)
  );

  // Fetch metadata for older posts (in parallel, batched)
  const olderPosts: SubstackPost[] = [];
  const batchSize = 10;
  for (let i = 0; i < olderUrls.length; i += batchSize) {
    const batch = olderUrls.slice(i, i + batchSize);
    const results = await Promise.all(batch.map(fetchPostMetadata));
    for (const post of results) {
      if (post && !isPodcastEpisode({ title: post.title })) {
        olderPosts.push(post);
      }
    }
  }

  // Combine and sort by date (newest first)
  const allPosts = [...rssPosts, ...olderPosts];
  return allPosts.sort(
    (a, b) => new Date(b.pubDate).getTime() - new Date(a.pubDate).getTime()
  );
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
