'use client';

import React, { useEffect, useState } from 'react';
import Papa from 'papaparse';
import {
    LineChart, Line, AreaChart, Area, BarChart, Bar,
    XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
    PieChart, Pie, Cell
} from 'recharts';
import {
    processSentimentOverTime,
    processTagsDistribution,
    RawData,
    ProcessedSentiment,
    ProcessedTag
} from '@/lib/data-processor';
import {
    Users,
    MessageSquare,
    TrendingUp,
    AlertCircle,
    MapPin
} from 'lucide-react';

const COLORS = {
    positive: '#10b981',
    negative: '#ef4444',
    neutral: '#f59e0b',
    engagements: '#6366f1',
    replies: '#ec4899'
};

export default function Dashboard() {
    const [data, setData] = useState<RawData[]>([]);
    const [sentimentOverTime, setSentimentOverTime] = useState<ProcessedSentiment[]>([]);
    const [tagsDistribution, setTagsDistribution] = useState<ProcessedTag[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetch('/lean_df.csv')
            .then((response) => response.text())
            .then((csvText) => {
                Papa.parse(csvText, {
                    header: true,
                    skipEmptyLines: true,
                    complete: (results) => {
                        const rawData = results.data as RawData[];
                        setData(rawData);
                        setSentimentOverTime(processSentimentOverTime(rawData));
                        setTagsDistribution(processTagsDistribution(rawData));
                        setLoading(false);
                    },
                });
            });
    }, []);

    if (loading) {
        return (
            <div className="flex h-screen items-center justify-center bg-zinc-950 text-zinc-400">
                <div className="flex flex-col items-center gap-4">
                    <div className="h-12 w-12 animate-spin rounded-full border-4 border-zinc-800 border-t-zinc-200" />
                    <p className="text-sm font-medium">Loading Dashboard Data...</p>
                </div>
            </div>
        );
    }

    const totals = data.reduce((acc, curr) => {
        acc.engagements += Number(curr['Total Engagements']) || 0;
        acc.replies += Number(curr['Number of Replies']) || 0;
        const s = curr['sentiment text']?.toLowerCase();
        if (s === 'positive') acc.positive++;
        else if (s === 'negative') acc.negative++;
        else acc.neutral++;
        return acc;
    }, { engagements: 0, replies: 0, positive: 0, negative: 0, neutral: 0 });

    return (
        <div className="min-h-screen bg-zinc-950 p-4 md:p-8 text-zinc-100 font-sans">
            <div className="mx-auto max-w-7xl space-y-8">
                {/* Header */}
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-zinc-800 pb-8">
                    <div>
                        <h1 className="text-3xl font-bold tracking-tight text-white mb-1">
                            Lagos State BRT Dashboard
                        </h1>
                        <p className="text-zinc-400 flex items-center gap-2">
                            <MapPin className="h-4 w-4" /> Transit Analytics & Sentiment Monitoring
                        </p>
                    </div>
                    <div className="flex items-center gap-3 bg-zinc-900 px-4 py-2 rounded-lg border border-zinc-800">
                        <div className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                        <span className="text-sm font-medium text-zinc-300">Live Data Feed</span>
                    </div>
                </div>

                {/* Stats Cards */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                    <StatCard
                        title="Total Engagements"
                        value={totals.engagements.toLocaleString()}
                        icon={<Users className="text-indigo-400" />}
                        description="Across all analyzed tweets"
                    />
                    <StatCard
                        title="Total Replies"
                        value={totals.replies.toLocaleString()}
                        icon={<MessageSquare className="text-pink-400" />}
                        description="Public response volume"
                    />
                    <StatCard
                        title="Positive Sentiment"
                        value={`${Math.round((totals.positive / data.length) * 100)}%`}
                        icon={<TrendingUp className="text-emerald-400" />}
                        description={`${totals.positive} positive records`}
                    />
                    <StatCard
                        title="Critical Issues"
                        value={totals.negative.toLocaleString()}
                        icon={<AlertCircle className="text-red-400" />}
                        description="Negative sentiment reports"
                    />
                </div>

                {/* Charts Grid */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                    {/* Sentiment Distribution Over Time */}
                    <SectionCard title="Sentiment Distribution Over Time">
                        <div className="h-[350px] w-full">
                            <ResponsiveContainer width="100%" height="100%">
                                <AreaChart data={sentimentOverTime}>
                                    <defs>
                                        <linearGradient id="colorPos" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="5%" stopColor={COLORS.positive} stopOpacity={0.3} />
                                            <stop offset="95%" stopColor={COLORS.positive} stopOpacity={0} />
                                        </linearGradient>
                                        <linearGradient id="colorNeg" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="5%" stopColor={COLORS.negative} stopOpacity={0.3} />
                                            <stop offset="95%" stopColor={COLORS.negative} stopOpacity={0} />
                                        </linearGradient>
                                    </defs>
                                    <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
                                    <XAxis
                                        dataKey="date"
                                        stroke="#71717a"
                                        fontSize={12}
                                        tickFormatter={(val) => new Date(val).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                                    />
                                    <YAxis stroke="#71717a" fontSize={12} />
                                    <Tooltip
                                        contentStyle={{ backgroundColor: '#09090b', borderColor: '#27272a', color: '#f4f4f5' }}
                                        itemStyle={{ fontSize: '12px' }}
                                    />
                                    <Legend verticalAlign="top" height={36} />
                                    <Area name="Positive" type="monotone" dataKey="positive" stroke={COLORS.positive} fillOpacity={1} fill="url(#colorPos)" />
                                    <Area name="Negative" type="monotone" dataKey="negative" stroke={COLORS.negative} fillOpacity={1} fill="url(#colorNeg)" />
                                    <Area name="Neutral" type="monotone" dataKey="neutral" stroke={COLORS.neutral} fill="transparent" />
                                </AreaChart>
                            </ResponsiveContainer>
                        </div>
                    </SectionCard>

                    {/* Sentiment Weighted by Engagement Over Time */}
                    <SectionCard title="Weighted Engagement by Sentiment">
                        <div className="h-[350px] w-full">
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={sentimentOverTime}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
                                    <XAxis
                                        dataKey="date"
                                        stroke="#71717a"
                                        fontSize={12}
                                        tickFormatter={(val) => new Date(val).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                                    />
                                    <YAxis stroke="#71717a" fontSize={12} />
                                    <Tooltip
                                        contentStyle={{ backgroundColor: '#09090b', borderColor: '#27272a', color: '#f4f4f5' }}
                                        itemStyle={{ fontSize: '12px' }}
                                    />
                                    <Legend verticalAlign="top" height={36} />
                                    <Bar name="Engagements" dataKey="totalEngagements" fill={COLORS.engagements} radius={[4, 4, 0, 0]} />
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    </SectionCard>

                    {/* Tags Over Time - Stacked Sentiment */}
                    <SectionCard title="Top 10 Feature Tags (Segmentation)">
                        <div className="h-[400px] w-full">
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={tagsDistribution} layout="vertical">
                                    <CartesianGrid strokeDasharray="3 3" stroke="#27272a" horizontal={false} />
                                    <XAxis type="number" stroke="#71717a" fontSize={12} />
                                    <YAxis dataKey="tag" type="category" stroke="#71717a" fontSize={12} width={100} />
                                    <Tooltip
                                        contentStyle={{ backgroundColor: '#09090b', borderColor: '#27272a', color: '#f4f4f5' }}
                                        itemStyle={{ fontSize: '12px' }}
                                    />
                                    <Legend verticalAlign="top" height={36} />
                                    <Bar name="Positive" dataKey="positive" stackId="a" fill={COLORS.positive} />
                                    <Bar name="Neutral" dataKey="neutral" stackId="a" fill={COLORS.neutral} />
                                    <Bar name="Negative" dataKey="negative" stackId="a" fill={COLORS.negative} />
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    </SectionCard>

                    {/* Sentiment Weighted by Replies */}
                    <SectionCard title="Weighted Replies Trend">
                        <div className="h-[400px] w-full">
                            <ResponsiveContainer width="100%" height="100%">
                                <LineChart data={sentimentOverTime}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
                                    <XAxis
                                        dataKey="date"
                                        stroke="#71717a"
                                        fontSize={12}
                                        tickFormatter={(val) => new Date(val).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                                    />
                                    <YAxis stroke="#71717a" fontSize={12} />
                                    <Tooltip
                                        contentStyle={{ backgroundColor: '#09090b', borderColor: '#27272a', color: '#f4f4f5' }}
                                        itemStyle={{ fontSize: '12px' }}
                                    />
                                    <Legend verticalAlign="top" height={36} />
                                    <Line name="Replies" type="stepAfter" dataKey="totalReplies" stroke={COLORS.replies} strokeWidth={2} dot={{ fill: COLORS.replies, r: 4 }} />
                                </LineChart>
                            </ResponsiveContainer>
                        </div>
                    </SectionCard>
                </div>
            </div>
        </div>
    );
}

function StatCard({ title, value, icon, description }: { title: string, value: string, icon: React.ReactNode, description: string }) {
    return (
        <div className="bg-zinc-900 border border-zinc-800 p-6 rounded-xl space-y-2 hover:border-zinc-700 transition-colors">
            <div className="flex items-center justify-between">
                <span className="text-zinc-400 text-sm font-medium uppercase tracking-wider">{title}</span>
                {icon}
            </div>
            <div className="text-2xl font-bold text-white tracking-tight">{value}</div>
            <p className="text-xs text-zinc-500 font-normal">{description}</p>
        </div>
    );
}

function SectionCard({ title, children }: { title: string, children: React.ReactNode }) {
    return (
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
            <div className="border-b border-zinc-800 px-6 py-4">
                <h3 className="text-lg font-semibold text-zinc-200">{title}</h3>
            </div>
            <div className="p-6">
                {children}
            </div>
        </div>
    );
}
