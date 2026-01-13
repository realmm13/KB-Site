export interface SubstackPost {
  title: string;
  link: string;
  pubDate: string;
  excerpt: string;
  content: string;
  image?: string;
}

export interface PodcastEpisode {
  title: string;
  link: string;
  pubDate: string;
  excerpt: string;
  duration?: string;
  audioUrl?: string;
}

export interface Book {
  id: string;
  title: string;
  author: string;
  myRating: number;
  averageRating?: number;
  yearPublished?: number;
  dateRead?: string;
  review?: string;
}
