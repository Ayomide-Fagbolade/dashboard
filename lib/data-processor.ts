import { parse } from 'date-fns';

export interface RawData {
  'Date of Tweet': string;
  'sentiment text': string;
  'Total Engagements': string | number;
  'Number of Replies': string | number;
  tags: string;
  merged_label: string;
}

export interface ProcessedSentiment {
  date: string;
  positive: number;
  negative: number;
  neutral: number;
  totalEngagements: number;
  totalReplies: number;
}

export interface ProcessedTag {
  tag: string;
  positive: number;
  negative: number;
  neutral: number;
  total: number;
}

export const processSentimentOverTime = (data: RawData[]): ProcessedSentiment[] => {
  const grouped: Record<string, ProcessedSentiment> = {};

  data.forEach((row) => {
    const dateStr = row['Date of Tweet'];
    if (!dateStr) return;

    if (!grouped[dateStr]) {
      grouped[dateStr] = {
        date: dateStr,
        positive: 0,
        negative: 0,
        neutral: 0,
        totalEngagements: 0,
        totalReplies: 0,
      };
    }

    const sentiment = row['sentiment text']?.toLowerCase();
    if (sentiment === 'positive') grouped[dateStr].positive++;
    else if (sentiment === 'negative') grouped[dateStr].negative++;
    else if (sentiment === 'neutral') grouped[dateStr].neutral++;

    grouped[dateStr].totalEngagements += Number(row['Total Engagements']) || 0;
    grouped[dateStr].totalReplies += Number(row['Number of Replies']) || 0;
  });

  return Object.values(grouped).sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
};

export const processTagsDistribution = (data: RawData[]): ProcessedTag[] => {
  const tagMap: Record<string, ProcessedTag> = {};

  data.forEach((row) => {
    const tags = row.tags?.split(',').map((t) => t.trim()).filter((t) => t && t !== 'OTHERS');
    if (!tags) return;

    const sentiment = row['sentiment text']?.toLowerCase();

    tags.forEach((tag) => {
      if (!tagMap[tag]) {
        tagMap[tag] = { tag, positive: 0, negative: 0, neutral: 0, total: 0 };
      }

      if (sentiment === 'positive') tagMap[tag].positive++;
      else if (sentiment === 'negative') tagMap[tag].negative++;
      else if (sentiment === 'neutral') tagMap[tag].neutral++;
      tagMap[tag].total++;
    });
  });

  return Object.values(tagMap).sort((a, b) => b.total - a.total).slice(0, 10);
};
