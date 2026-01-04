import { GoogleGenerativeAI } from '@google/generative-ai';

export interface AISection {
    id: string;
    label: string;
    content: string;
}

export const REPORT_SECTIONS = [
    {
        id: 'hotspots',
        label: 'Transit Hotspots',
        instruction: 'Summarize specific locations, terminals, or stations experiencing bottlenecks, overcrowding, or high traffic. Be precise.'
    },
    {
        id: 'incidents',
        label: 'Critical Incidents',
        instruction: 'Synthesize and summarize specific unique accidents, safety breaches, or recurring mechanical failures into a single analytical paragraph. Mention specific spots or dates if found.'
    },
    {
        id: 'conduct',
        label: 'Staff & Operator Audit',
        instruction: 'Analyze mentions of driver behavior, terminal staff conduct, or professional ethics. Focus on complaints or praises.'
    },
    {
        id: 'safety',
        label: 'Accessibility & Safety',
        instruction: 'Audit concerns regarding security, lighting, harassment, or inclusivity for the elderly and disabled.'
    },
    {
        id: 'infrastructure',
        label: 'Infrastructure & Equipment',
        instruction: 'Audit the state of ACs, buses, payment (Cowry) systems, and terminal facilities.'
    },
    {
        id: 'suggestions',
        label: 'Actionable Suggestions',
        instruction: 'Identify and list specific passenger requests for new routes, facility upgrades, or service changes. Focus on "should", "could", and "please" statements.'
    }
];

export async function generateReportSection(
    section: typeof REPORT_SECTIONS[0],
    data: any[],
    sentimentSummary: string,
    topTags: string,
    apiKey: string
): Promise<string> {
    // Use all filtered data, sorted by engagement
    const sectionRelevantData = data
        .sort((a, b) => (Number(b['Total Engagements']) || 0) - (Number(a['Total Engagements']) || 0))
        .slice(0, 20); // Increased from 15 to 20 for better context

    const contextText = sectionRelevantData
        .map(t => t['cleaned tweet'] || t['tweet'] || t['tweet content'])
        .filter(Boolean)
        .join('\n- ');

    try {
        const genAI = new GoogleGenerativeAI(apiKey);
        const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

        const prompt = `You are a Lagos Transit Intelligence Analyst.
Task: Provide a BRIEF (one paragraph) and SPECIFIC analysis for the category: ${section.label}.
Instruction: ${section.instruction}

Rules:
1. Provide ONLY the analysis paragraph.
2. DO NOT mention statistics.
3. DO NOT use markdown formatting like stars or dashes.
4. Be succinct and factual.
5. If no specific information is found, return exactly: "No specific reports found for this focus area in the current dataset."

Data Context (Top Reports for this Category):
${contextText}`;

        const result = await model.generateContent(prompt);
        let text = result.response.text().trim();

        // Cleanup potential leftovers
        text = text
            .replace(/\*/g, '')
            .replace(/^- /mg, '')
            .replace(/^Analysis:/i, '')
            .trim();

        return text || 'No specific reports found for this focus area in the current dataset.';
    } catch (error: any) {
        console.error(`Error generating section ${section.id}:`, error);
        return 'Analysis temporarily unavailable.';
    }
}
