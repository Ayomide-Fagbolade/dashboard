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
import { generateReportSection, REPORT_SECTIONS } from '@/lib/ai-service';
import {
    Users,
    MessageSquare,
    TrendingUp,
    TrendingDown,
    AlertCircle,
    MapPin,
    Calendar,
    Sparkles,
    Loader2,
    Lock,
    ChevronUp,
    ChevronDown
} from 'lucide-react';
import { subDays, isAfter, parseISO, max } from 'date-fns';

const COLORS = {
    positive: '#0ea5e9', // Sky Blue for positive
    negative: '#f43f5e', // Rose for negative
    neutral: '#94a3b8',  // Slate for neutral
    engagements: '#0ea5e9',
    replies: '#38bdf8'
};

export default function Dashboard() {
    const [data, setData] = useState<RawData[]>([]);
    const [filteredData, setFilteredData] = useState<RawData[]>([]);
    const [sentimentOverTime, setSentimentOverTime] = useState<ProcessedSentiment[]>([]);
    const [tagsDistribution, setTagsDistribution] = useState<ProcessedTag[]>([]);
    const [timeframe, setTimeframe] = useState('all');
    const [customRange, setCustomRange] = useState({ start: '', end: '' });
    const [filterMode, setFilterMode] = useState<'tags' | 'topics'>('tags');
    const [selectedTags, setSelectedTags] = useState<string[]>([]);
    const [selectedTopics, setSelectedTopics] = useState<string[]>([]);
    const [filterCollapsed, setFilterCollapsed] = useState(false);
    const [aggregation, setAggregation] = useState<'daily' | 'monthly'>('monthly');
    const [loading, setLoading] = useState(true);

    // AI States
    const [aiResults, setAiResults] = useState<Record<string, string>>({});
    const [aiLoading, setAiLoading] = useState(false);
    const [activeSectionId, setActiveSectionId] = useState<string | null>(null);
    const [aiCollapsed, setAiCollapsed] = useState(false);
    const [hfToken, setHfToken] = useState(process.env.NEXT_PUBLIC_HF_TOKEN || '');
    const [showTokenInput, setShowTokenInput] = useState(false);

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
                        setLoading(false);
                    },
                });
            });
    }, []);

    useEffect(() => {
        if (data.length === 0) return;

        let filtered = data;
        if (timeframe === 'custom') {
            if (customRange.start && customRange.end) {
                const start = parseISO(customRange.start);
                const end = parseISO(customRange.end);
                filtered = filtered.filter(d => {
                    const dDate = parseISO(d['Date of Tweet']);
                    if (isNaN(dDate.getTime())) return false;
                    return (isAfter(dDate, start) || dDate.getTime() === start.getTime()) &&
                        (isAfter(end, dDate) || dDate.getTime() === end.getTime());
                });
            }
        }

        if (filterMode === 'tags' && selectedTags.length > 0) {
            filtered = filtered.filter(d => {
                const tags = d.tags?.split(',').map(t => t.trim().toUpperCase()) || [];
                // If "FARES" is selected, it should match both "FARES" and "FAIRS" (normalized to FARES)
                return selectedTags.some(selectedTag => {
                    const normalizedSelected = selectedTag.toUpperCase();
                    return tags.includes(normalizedSelected) ||
                        (normalizedSelected === 'FARES' && tags.includes('FAIRS'));
                });
            });
        } else if (filterMode === 'topics' && selectedTopics.length > 0) {
            filtered = filtered.filter(d => {
                const label = d.merged_label === 'Noise' ? 'Others' : d.merged_label;
                return label && selectedTopics.includes(label);
            });
        }

        setFilteredData(filtered);
        setSentimentOverTime(processSentimentOverTime(filtered, aggregation));
        setTagsDistribution(processTagsDistribution(filtered));
        setAiResults({}); // Reset summary when filters change
    }, [data, timeframe, customRange, selectedTags, selectedTopics, filterMode, aggregation]);

    const totals = filteredData.reduce((acc, curr) => {
        acc.engagements += Number(curr['Total Engagements']) || 0;
        acc.replies += Number(curr['Number of Replies']) || 0;
        const s = curr['sentiment text']?.toLowerCase();
        if (s === 'positive') acc.positive++;
        else if (s === 'negative') acc.negative++;
        else acc.neutral++;
        return acc;
    }, { engagements: 0, replies: 0, positive: 0, negative: 0, neutral: 0 });

    const handleGenerateSummary = async () => {
        if (!hfToken) {
            setShowTokenInput(true);
            return;
        }

        setAiLoading(true);
        setAiResults({});
        setShowTokenInput(false);

        const sentimentSummary = `Positive: ${totals.positive}, Negative: ${totals.negative}, Neutral: ${totals.neutral}`;
        const topTags = tagsDistribution.slice(0, 5).map(t => `${t.tag} (${t.total})`).join(', ');

        try {
            for (const section of REPORT_SECTIONS) {
                setActiveSectionId(section.id);
                const content = await generateReportSection(section, filteredData, sentimentSummary, topTags, hfToken);
                setAiResults(prev => ({ ...prev, [section.id]: content }));
            }
        } catch (error: any) {
            console.error('AI Generation Error:', error);
        } finally {
            setAiLoading(false);
            setActiveSectionId(null);
        }
    };

    if (loading) {
        return (
            <div className="flex h-screen items-center justify-center bg-slate-50 text-slate-400">
                <div className="flex flex-col items-center gap-4">
                    <div className="h-12 w-12 animate-spin rounded-full border-4 border-slate-200 border-t-sky-500" />
                    <p className="text-sm font-medium">Loading Dashboard Data...</p>
                </div>
            </div>
        );
    }

    const allDates = data.map(d => parseISO(d['Date of Tweet'])).filter(d => !isNaN(d.getTime()));
    const latestDate = allDates.length > 0 ? max(allDates) : null;

    const allTags = Array.from(new Set(
        data.flatMap(d => d.tags?.split(',').map(t => {
            const tag = t.trim().toUpperCase();
            return tag === 'FAIRS' ? 'FARES' : tag;
        }) || [])
    )).filter(Boolean).sort();

    const allTopics = Array.from(new Set(data.map(d => {
        const label = d.merged_label;
        return label === 'Noise' ? 'Others' : label;
    }))).filter(Boolean).map(label => {
        const firstMatch = data.find(d => {
            const l = d.merged_label === 'Noise' ? 'Others' : d.merged_label;
            return l === label;
        });
        return {
            label,
            description: firstMatch?.merged_description || ''
        };
    }).sort((a, b) => a.label.localeCompare(b.label));

    const toggleTag = (tag: string) => {
        setSelectedTags(prev =>
            prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag]
        );
    };

    const toggleTopic = (topic: string) => {
        setSelectedTopics(prev =>
            prev.includes(topic) ? prev.filter(t => t !== topic) : [...prev, topic]
        );
    };

    return (
        <div className="min-h-screen bg-slate-50 p-4 md:p-8 text-slate-900 font-sans">
            <div className="mx-auto max-w-7xl space-y-8">
                {/* Hero Section */}
                <div className="relative min-h-[400px] md:h-[400px] w-full rounded-3xl overflow-hidden shadow-2xl mb-8 group">
                    <img
                        src="/brt-bus.png"
                        alt="Lagos BRT Bus"
                        className="absolute inset-0 w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
                    />
                    <div className="absolute inset-0 bg-gradient-to-b md:bg-gradient-to-r from-slate-900/95 via-slate-900/70 md:via-slate-900/40 to-slate-900/40 md:to-transparent p-6 md:p-12 flex flex-col justify-center items-center md:items-start text-center md:text-left">
                        <div className="flex flex-col md:flex-row items-center gap-4 md:gap-6 mb-6 md:mb-8 animate-in fade-in slide-in-from-top-8 md:slide-in-from-left-8 duration-700">
                            <div className="bg-white p-2.5 md:p-4 rounded-full shadow-2xl flex items-center justify-center border-4 border-white/20">
                                <img
                                    src="/lagos-logo.png"
                                    alt="Lagos State Logo"
                                    className="h-14 w-14 md:h-24 md:w-24 object-contain"
                                />
                            </div>
                            <div className="h-px md:h-16 w-12 md:w-px bg-white/20" />
                            <div>
                                <h1 className="text-4xl md:text-6xl font-black tracking-tighter text-white mb-1 md:mb-2 uppercase italic leading-none">
                                    BRT <span className="text-sky-400">PULSE</span>
                                </h1>
                                <p className="text-sky-100 text-[10px] md:text-lg font-bold tracking-widest uppercase flex items-center justify-center md:justify-start gap-2">
                                    <MapPin className="h-3 md:h-5 w-3 md:w-5 text-sky-400" /> Lagos State Transit Intelligence
                                </p>
                            </div>
                        </div>
                        <p className="max-w-2xl text-slate-200 text-sm md:text-lg font-medium leading-relaxed drop-shadow-md mb-6 md:mb-4 px-4 md:px-0">
                            Monitoring passenger sentiment, operational visibility and engagement trends on Nigeria's largest BRT network.
                        </p>
                        {latestDate && (
                            <div className="flex items-center gap-2 text-sky-300 text-[10px] md:text-xs font-bold uppercase tracking-[0.2em] bg-sky-950/40 w-fit px-4 py-2 rounded-lg backdrop-blur-md border border-sky-500/20">
                                <Calendar className="h-3.5 w-3.5" />
                                <span>Latest Data: {latestDate.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}</span>
                            </div>
                        )}
                    </div>
                    <div className="absolute bottom-4 right-4 md:bottom-10 md:right-10 flex items-center gap-3 md:gap-4 bg-white/10 backdrop-blur-md px-4 py-2 md:px-6 md:py-4 rounded-xl md:rounded-2xl border border-white/20 shadow-xl">
                        <div className="text-right">
                            <p className="text-white font-black text-lg md:text-xl leading-tight">853+</p>
                            <p className="text-sky-200 text-[8px] md:text-[10px] font-bold uppercase tracking-widest">Active Reports</p>
                        </div>
                    </div>
                </div>

                {/* Sub-Header / Controls */}
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-200 pb-8">
                    <div className="flex flex-col md:flex-row items-stretch md:items-center gap-4">
                        <div className="flex items-center gap-1 bg-white p-1 rounded-xl border border-slate-200 shadow-sm w-full md:w-auto overflow-x-auto no-scrollbar">
                            <TimeframeButton
                                active={timeframe === 'all'}
                                onClick={() => setTimeframe('all')}
                                label="All Time"
                            />
                            <TimeframeButton
                                active={timeframe === 'custom'}
                                onClick={() => setTimeframe('custom')}
                                label="Custom Range"
                            />
                        </div>

                        <div className="flex items-center justify-between md:justify-start gap-4">
                            <div className="h-8 w-px bg-slate-200 hidden md:block" />
                            <div className="flex items-center gap-1 bg-white p-1 rounded-xl border border-slate-200 shadow-sm grow md:grow-0">
                                <TimeframeButton
                                    active={aggregation === 'daily'}
                                    onClick={() => setAggregation('daily')}
                                    label="Daily"
                                />
                                <TimeframeButton
                                    active={aggregation === 'monthly'}
                                    onClick={() => setAggregation('monthly')}
                                    label="Monthly"
                                />
                            </div>
                        </div>

                        {timeframe === 'custom' && (
                            <div className="flex items-center gap-2 bg-white p-1 rounded-xl border border-slate-200 shadow-sm animate-in fade-in slide-in-from-top-2 w-full md:w-auto">
                                <input
                                    type="date"
                                    className="px-3 py-1 text-xs font-bold border-none focus:ring-0 text-slate-600 bg-transparent cursor-pointer grow shrink min-w-0"
                                    value={customRange.start}
                                    onChange={(e) => setCustomRange(prev => ({ ...prev, start: e.target.value }))}
                                />
                                <span className="text-slate-300 font-bold shrink-0">→</span>
                                <input
                                    type="date"
                                    className="px-3 py-1 text-xs font-bold border-none focus:ring-0 text-slate-600 bg-transparent cursor-pointer grow shrink min-w-0"
                                    value={customRange.end}
                                    onChange={(e) => setCustomRange(prev => ({ ...prev, end: e.target.value }))}
                                />
                            </div>
                        )}
                    </div>
                </div>

                {/* Filter Controls Area */}
                <div className="bg-white border border-slate-200 rounded-2xl md:rounded-3xl overflow-hidden shadow-sm transition-all duration-500">
                    <div className="p-6 md:p-8 border-b border-slate-50 flex flex-col md:flex-row md:items-center justify-between gap-6">
                        <div className="flex items-center gap-3 md:gap-4">
                            <div className="bg-sky-500 p-2 rounded-xl shrink-0">
                                <Sparkles className="h-5 w-5 text-white" />
                            </div>
                            <div>
                                <h3 className="text-lg md:text-xl font-bold text-slate-800">Advanced Analytics Filter</h3>
                                <p className="text-slate-500 text-xs md:text-sm font-medium">Switch between broad tags or deep-dive AI topics</p>
                            </div>
                        </div>

                        <div className="flex items-center justify-between md:justify-end gap-4">
                            <div className="flex bg-slate-100 p-1 rounded-2xl border border-slate-200 overflow-x-auto no-scrollbar">
                                <button
                                    onClick={() => setFilterMode('tags')}
                                    className={`px-4 md:px-6 py-2 rounded-xl text-xs md:text-sm font-bold transition-all whitespace-nowrap ${filterMode === 'tags' ? 'bg-white text-sky-600 shadow-md translate-y-[-1px]' : 'text-slate-500 hover:text-slate-700'}`}
                                >
                                    By Tags
                                </button>
                                <button
                                    onClick={() => setFilterMode('topics')}
                                    className={`px-4 md:px-6 py-2 rounded-xl text-xs md:text-sm font-bold transition-all whitespace-nowrap ${filterMode === 'topics' ? 'bg-white text-sky-600 shadow-md translate-y-[-1px]' : 'text-slate-500 hover:text-slate-700'}`}
                                >
                                    By Topics (AI)
                                </button>
                            </div>
                            <button
                                onClick={() => setFilterCollapsed(!filterCollapsed)}
                                className="p-2.5 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-400 transition-colors shrink-0"
                            >
                                {filterCollapsed ? <ChevronDown className="h-5 w-5" /> : <ChevronUp className="h-5 w-5" />}
                            </button>
                        </div>
                    </div>

                    {!filterCollapsed && (
                        <div className="p-6 md:p-8 bg-slate-50/30 animate-in fade-in slide-in-from-top-4 duration-500">
                            {filterMode === 'tags' ? (
                                <div className="flex flex-wrap gap-2">
                                    {allTags.map(tag => (
                                        <button
                                            key={tag}
                                            onClick={() => toggleTag(tag)}
                                            className={`px-4 py-2 rounded-full text-xs font-bold transition-all duration-200 border ${selectedTags.includes(tag)
                                                ? 'bg-sky-500 text-white border-sky-500 shadow-lg shadow-sky-200'
                                                : 'bg-white text-slate-500 border-slate-200 hover:border-sky-300 hover:text-sky-500'
                                                }`}
                                        >
                                            {tag}
                                        </button>
                                    ))}
                                    {selectedTags.length > 0 && (
                                        <button
                                            onClick={() => setSelectedTags([])}
                                            className="px-4 py-2 rounded-full text-xs font-bold text-rose-500 hover:bg-rose-50 transition-colors"
                                        >
                                            Clear Selection
                                        </button>
                                    )}
                                </div>
                            ) : (
                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                    {allTopics.map(topic => (
                                        <button
                                            key={topic.label}
                                            onClick={() => toggleTopic(topic.label)}
                                            className={`text-left p-5 rounded-2xl border-2 transition-all group relative overflow-hidden ${selectedTopics.includes(topic.label)
                                                ? 'bg-sky-50 border-sky-500 shadow-lg'
                                                : 'bg-white border-slate-100 hover:border-sky-200 hover:shadow-md'
                                                }`}
                                        >
                                            <div className="relative z-10">
                                                <h4 className={`text-sm font-bold mb-2 transition-colors ${selectedTopics.includes(topic.label) ? 'text-sky-700' : 'text-slate-800'}`}>
                                                    {topic.label}
                                                </h4>
                                                <p className="text-[11px] text-slate-500 leading-relaxed line-clamp-2 italic group-hover:line-clamp-none transition-all">
                                                    {topic.description}
                                                </p>
                                            </div>
                                            {selectedTopics.includes(topic.label) && (
                                                <div className="absolute top-2 right-2 h-4 w-4 bg-sky-500 rounded-full flex items-center justify-center">
                                                    <div className="h-1.5 w-1.5 bg-white rounded-full" />
                                                </div>
                                            )}
                                        </button>
                                    ))}
                                    {selectedTopics.length > 0 && (
                                        <div className="col-span-full">
                                            <button
                                                onClick={() => setSelectedTopics([])}
                                                className="text-xs font-bold text-rose-500 hover:text-rose-600 transition-colors py-2 px-4 bg-rose-50 rounded-lg"
                                            >
                                                Clear All Topics
                                            </button>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    )}
                </div>

                {/* Stats Cards */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    <StatCard
                        title="Total Engagements"
                        value={totals.engagements.toLocaleString()}
                        icon={<Users className="text-sky-500" />}
                        description={`Data from ${filteredData.length} tweets`}
                    />
                    <StatCard
                        title="Total Replies"
                        value={totals.replies.toLocaleString()}
                        icon={<MessageSquare className="text-sky-400" />}
                        description="Public response volume"
                    />
                    <StatCard
                        title="Negative Sentiment"
                        value={`${filteredData.length > 0 ? Math.round((totals.negative / filteredData.length) * 100) : 0}%`}
                        icon={<TrendingDown className="text-rose-600" />}
                        description={`${totals.negative} negative records`}
                    />
                </div>

                {/* AI Summary Section */}
                <div className="bg-white border border-slate-200 rounded-2xl md:rounded-3xl overflow-hidden shadow-sm hover:shadow-md transition-all duration-300">
                    <div className="bg-gradient-to-r from-sky-500 to-sky-600 px-6 md:px-8 py-5 md:py-6 flex flex-col md:flex-row md:items-center justify-between gap-6">
                        <div className="flex items-center gap-3">
                            <div className="bg-white/20 p-2 rounded-xl backdrop-blur-sm">
                                <Sparkles className="h-5 md:h-6 w-5 md:w-6 text-white" />
                            </div>
                            <div>
                                <h3 className="text-lg md:text-xl font-bold text-white">Llama-3.1 Issue Intelligence</h3>
                                <p className="text-sky-100 text-[10px] md:text-sm font-medium">Auditing hotspots, conduct, safety, and infrastructure health</p>
                            </div>
                        </div>
                        <div className="flex items-center gap-3 md:gap-4 justify-between md:justify-end">
                            {(Object.keys(aiResults).length > 0 || aiLoading) && (
                                <button
                                    onClick={() => setAiCollapsed(!aiCollapsed)}
                                    className="p-2 hover:bg-white/10 rounded-lg text-white transition-colors flex items-center gap-2 grow md:grow-0 justify-center md:justify-start bg-white/5 md:bg-transparent"
                                    title={aiCollapsed ? "Expand Analysis" : "Collapse Analysis"}
                                >
                                    <span className="text-[10px] font-black uppercase tracking-widest">
                                        {aiCollapsed ? 'Expand' : 'Collapse'} Report
                                    </span>
                                    {aiCollapsed ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
                                </button>
                            )}
                            <div className="h-6 w-px bg-white/20 hidden md:block" />
                            {showTokenInput ? (
                                <div className="flex items-center gap-2 animate-in fade-in slide-in-from-right-4 grow md:grow-0">
                                    <div className="relative grow md:grow-0">
                                        <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-3 w-3 md:h-3.5 md:w-3.5 text-slate-400" />
                                        <input
                                            type="password"
                                            placeholder="HF Token"
                                            className="pl-8 md:pl-9 pr-3 md:pr-4 py-2 bg-white rounded-xl text-[10px] md:text-xs font-bold border-none focus:ring-2 focus:ring-sky-300 transition-all w-full md:w-48 shadow-inner"
                                            value={hfToken}
                                            onChange={(e) => setHfToken(e.target.value)}
                                        />
                                    </div>
                                    <button
                                        onClick={handleGenerateSummary}
                                        className="bg-sky-400 hover:bg-sky-300 text-white px-4 py-2 rounded-xl text-[10px] md:text-xs font-black transition-colors shadow-lg uppercase tracking-wider"
                                    >
                                        Go
                                    </button>
                                </div>
                            ) : (
                                <button
                                    onClick={handleGenerateSummary}
                                    disabled={aiLoading}
                                    className="bg-white/20 hover:bg-white/30 text-white px-4 md:px-6 py-2.5 rounded-xl text-xs md:text-sm font-black backdrop-blur-md transition-all flex items-center justify-center gap-2 shadow-lg disabled:opacity-50 grow md:grow-0 uppercase tracking-wider"
                                >
                                    {aiLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                                    {Object.keys(aiResults).length > 0 ? 'Regenerate Analysis' : 'Generate Full Report'}
                                </button>
                            )}
                        </div>
                    </div>
                    {!aiCollapsed && (Object.keys(aiResults).length > 0 || aiLoading) && (
                        <div className="p-6 md:p-8 space-y-6 md:space-y-8 animate-in fade-in duration-500">
                            {aiLoading && !activeSectionId && (
                                <div className="flex items-center gap-3 md:gap-4 py-4 md:py-8 animate-pulse">
                                    <div className="h-1.5 md:h-2 w-1.5 md:w-2 bg-sky-500 rounded-full" />
                                    <p className="text-[10px] md:text-sm font-bold text-slate-500 uppercase tracking-widest">Initializing AI Agents...</p>
                                </div>
                            )}

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 md:gap-8">
                                {REPORT_SECTIONS.map((section) => {
                                    const content = aiResults[section.id];
                                    const isActive = activeSectionId === section.id;

                                    if (!content && !isActive) return null;

                                    return (
                                        <div
                                            key={section.id}
                                            className={`p-6 rounded-2xl border transition-all duration-300 ${isActive
                                                ? 'bg-sky-50 border-sky-200 shadow-md ring-2 ring-sky-500/20'
                                                : 'bg-slate-50 border-slate-100 hover:bg-white hover:shadow-sm'
                                                }`}
                                        >
                                            <div className="flex items-center justify-between mb-4">
                                                <h4 className="text-sm font-black text-slate-800 uppercase tracking-wider">{section.label}</h4>
                                                {isActive && <Loader2 className="h-4 w-4 text-sky-500 animate-spin" />}
                                            </div>
                                            {content ? (
                                                <p className="text-slate-600 text-sm leading-relaxed font-medium capitalize-first">
                                                    {content}
                                                </p>
                                            ) : (
                                                <div className="space-y-2">
                                                    <div className="h-2 bg-slate-200 rounded-full w-full animate-pulse" />
                                                    <div className="h-2 bg-slate-200 rounded-full w-2/3 animate-pulse" />
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}
                </div>

                {/* Charts Grid */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 md:gap-8">
                    <div className="lg:col-span-2">
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
                                        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                                        <XAxis
                                            dataKey="date"
                                            stroke="#94a3b8"
                                            fontSize={12}
                                            tickFormatter={(val) => {
                                                const date = new Date(val);
                                                return aggregation === 'daily'
                                                    ? date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
                                                    : date.toLocaleDateString(undefined, { month: 'short', year: 'numeric' });
                                            }}
                                        />
                                        <YAxis stroke="#94a3b8" fontSize={12} />
                                        <Tooltip
                                            contentStyle={{ backgroundColor: '#ffffff', borderColor: '#e2e8f0', borderRadius: '8px', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)', color: '#1e293b' }}
                                            itemStyle={{ fontSize: '12px', fontWeight: 500 }}
                                            labelFormatter={(l) => {
                                                if (!l) return '';
                                                const date = new Date(l);
                                                return aggregation === 'daily'
                                                    ? date.toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' })
                                                    : date.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
                                            }}
                                        />
                                        <Legend verticalAlign="top" height={36} />
                                        <Area name="Positive" type="monotone" dataKey="positive" stroke={COLORS.positive} fillOpacity={1} fill="url(#colorPos)" />
                                        <Area name="Negative" type="monotone" dataKey="negative" stroke={COLORS.negative} fillOpacity={1} fill="url(#colorNeg)" />
                                        <Area name="Neutral" type="monotone" dataKey="neutral" stroke={COLORS.neutral} fill="transparent" />
                                    </AreaChart>
                                </ResponsiveContainer>
                            </div>
                        </SectionCard>
                    </div>

                    {/* Sentiment Weighted by Engagement Over Time */}
                    <SectionCard title="Engagement Over Time">
                        <div className="h-[350px] w-full">
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={sentimentOverTime}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                                    <XAxis
                                        dataKey="date"
                                        stroke="#94a3b8"
                                        fontSize={12}
                                        tickFormatter={(val) => {
                                            const date = new Date(val);
                                            return aggregation === 'daily'
                                                ? date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
                                                : date.toLocaleDateString(undefined, { month: 'short', year: 'numeric' });
                                        }}
                                    />
                                    <YAxis stroke="#94a3b8" fontSize={12} />
                                    <Tooltip
                                        content={({ active, payload, label }) => {
                                            if (active && payload && payload.length && label) {
                                                const date = new Date(label);
                                                const dateStr = aggregation === 'daily'
                                                    ? date.toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' })
                                                    : date.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });

                                                return (
                                                    <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xl overflow-hidden min-w-[200px]">
                                                        <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 border-b border-slate-50 pb-2">{dateStr}</div>
                                                        <div className="space-y-3">
                                                            <div className="flex items-center justify-between gap-4">
                                                                <div className="flex items-center gap-2">
                                                                    <div className="h-2 w-2 rounded-full bg-sky-500" />
                                                                    <span className="text-xs font-bold text-slate-600">Engagements</span>
                                                                </div>
                                                                <span className="text-sm font-black text-slate-900">{payload[0].value?.toLocaleString()}</span>
                                                            </div>
                                                            <div className="flex items-center justify-between gap-4">
                                                                <div className="flex items-center gap-2">
                                                                    <div className="h-2 w-2 rounded-full bg-slate-400" />
                                                                    <span className="text-xs font-bold text-slate-600">Replies</span>
                                                                </div>
                                                                <span className="text-sm font-black text-slate-900">{payload[1]?.value?.toLocaleString() || payload[0].payload.totalReplies?.toLocaleString()}</span>
                                                            </div>
                                                        </div>
                                                    </div>
                                                );
                                            }
                                            return null;
                                        }}
                                    />
                                    <Legend
                                        verticalAlign="top"
                                        height={48}
                                        content={() => (
                                            <div className="flex flex-col items-center gap-1 mb-4">
                                                <div className="flex items-center gap-2">
                                                    <div className="h-3 w-3 rounded-sm bg-sky-500" />
                                                    <span className="text-xs font-bold text-slate-600">Total Engagements (Height)</span>
                                                </div>
                                                <div className="flex items-center gap-4 text-[10px] text-slate-400 font-bold uppercase tracking-wider">
                                                    <span>Light: Fewer Replies</span>
                                                    <div className="h-1.5 w-16 bg-gradient-to-r from-sky-200 to-sky-600 rounded-full" />
                                                    <span>Dark: High Replies</span>
                                                </div>
                                            </div>
                                        )}
                                    />
                                    <Bar name="Engagements" dataKey="totalEngagements" radius={[4, 4, 0, 0]}>
                                        {(() => {
                                            const maxReplies = Math.max(...sentimentOverTime.map(d => d.totalReplies), 1);
                                            return sentimentOverTime.map((entry, index) => {
                                                const intensity = Math.min(Math.max(entry.totalReplies / maxReplies, 0.2), 1);
                                                return <Cell key={`cell-${index}`} fill={`rgba(14, 165, 233, ${intensity})`} />;
                                            });
                                        })()}
                                    </Bar>
                                    <Bar name="Replies" dataKey="totalReplies" hide />
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    </SectionCard>

                    {/* Tags Over Time - Stacked Sentiment */}
                    <SectionCard title="Top 10 Feature Tags (Segmentation)">
                        <div className="h-[400px] w-full">
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={tagsDistribution} layout="vertical">
                                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" horizontal={false} />
                                    <XAxis type="number" stroke="#94a3b8" fontSize={12} />
                                    <YAxis dataKey="tag" type="category" stroke="#94a3b8" fontSize={12} width={100} />
                                    <Tooltip
                                        contentStyle={{ backgroundColor: '#ffffff', borderColor: '#e2e8f0', borderRadius: '8px', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)', color: '#1e293b' }}
                                        itemStyle={{ fontSize: '12px', fontWeight: 500 }}
                                    />
                                    <Legend verticalAlign="top" height={36} />
                                    <Bar name="Positive" dataKey="positive" stackId="a" fill={COLORS.positive} />
                                    <Bar name="Neutral" dataKey="neutral" stackId="a" fill={COLORS.neutral} />
                                    <Bar name="Negative" dataKey="negative" stackId="a" fill={COLORS.negative} />
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    </SectionCard>


                </div>
            </div>
        </div>
    );
}

function TimeframeButton({ active, onClick, label }: { active: boolean, onClick: () => void, label: string }) {
    return (
        <button
            onClick={onClick}
            className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all duration-200 ${active
                ? 'bg-sky-500 text-white shadow-md shadow-sky-200'
                : 'text-slate-500 hover:bg-slate-50 hover:text-slate-700'
                }`}
        >
            {label}
        </button>
    );
}

function StatCard({ title, value, icon, description }: { title: string, value: string, icon: React.ReactNode, description: string }) {
    return (
        <div className="bg-white border border-slate-200 p-5 md:p-6 rounded-2xl space-y-1.5 md:space-y-2 hover:border-sky-300 hover:shadow-lg hover:shadow-sky-500/5 transition-all duration-300">
            <div className="flex items-center justify-between">
                <span className="text-slate-500 text-[10px] md:text-xs font-bold uppercase tracking-widest">{title}</span>
                <div className="p-1.5 md:p-2 bg-slate-50 rounded-lg shrink-0 [&_svg]:h-4 [&_svg]:w-4 md:[&_svg]:h-5 md:[&_svg]:w-5">
                    {icon}
                </div>
            </div>
            <div className="text-2xl md:text-3xl font-extrabold text-slate-900 tracking-tight">{value}</div>
            <p className="text-[10px] md:text-xs text-slate-400 font-medium line-clamp-1">{description}</p>
        </div>
    );
}

function SectionCard({ title, children }: { title: string, children: React.ReactNode }) {
    return (
        <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm hover:shadow-md transition-shadow duration-300">
            <div className="border-b border-slate-100 px-5 md:px-6 py-4 md:py-5 bg-slate-50/50 uppercase tracking-widest">
                <h3 className="text-sm md:text-lg font-black text-slate-800">{title}</h3>
            </div>
            <div className="p-4 md:p-6">
                {children}
            </div>
        </div>
    );
}
