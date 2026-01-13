import type { Book } from './types';
import booksData from '../data/books.json';

interface BooksData {
  books: Book[];
  lastUpdated: string;
}

const OPEN_LIBRARY_COVER_BASE = 'https://covers.openlibrary.org/b';

export function getBooks(): Book[] {
  return (booksData as BooksData).books;
}

function hasSubstantialReview(review: string | undefined | null): boolean {
  if (!review) return false;
  const trimmed = review.trim().toLowerCase();
  // Filter out empty or minimal reviews
  if (trimmed.length < 20) return false;
  if (trimmed === 'no notes' || trimmed === 'no notes.') return false;
  return true;
}

export function getFeaturedBooks(count = 6): Book[] {
  return getBooks()
    .filter(book => book.dateRead && hasSubstantialReview(book.review))
    .slice(0, count);
}

export function getAllBooks(): Book[] {
  return getBooks();
}

export function getOpenLibraryCoverUrl(
  title: string,
  author: string,
  size: 'S' | 'M' | 'L' = 'M'
): string {
  // Use Open Library search to get cover by title and author
  const query = encodeURIComponent(`${title} ${author}`);
  return `https://covers.openlibrary.org/b/olid/${query}-${size}.jpg`;
}

export function getOpenLibrarySearchCoverUrl(
  title: string,
  size: 'S' | 'M' | 'L' = 'M'
): string {
  // Use title-based ISBN lookup via Open Library
  const cleanTitle = title.replace(/[^\w\s]/g, '').toLowerCase();
  const encoded = encodeURIComponent(cleanTitle);
  return `https://covers.openlibrary.org/b/title/${encoded}-${size}.jpg`;
}

export function truncateReview(review: string | undefined | null, maxLength = 150): string {
  if (!review) return '';
  if (review.length <= maxLength) return review;
  return review.substring(0, maxLength).replace(/\s+\S*$/, '') + '...';
}

export function formatBookDate(dateString: string | undefined | null): string {
  if (!dateString) return '';
  // Parse as local date to avoid timezone offset issues
  const [year, month, day] = dateString.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

export function getAmazonSearchUrl(title: string, author: string): string {
  const query = encodeURIComponent(`${title} ${author}`);
  return `https://www.amazon.com/s?k=${query}&i=stripbooks`;
}

export function formatShortDate(dateString: string | undefined | null): string {
  if (!dateString) return '';
  // Parse as local date to avoid timezone offset issues
  const [year, month, day] = dateString.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}
