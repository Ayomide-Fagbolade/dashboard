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
        instruction: 'Summarize specific locations, terminals, or stations experiencing bottlenecks, overcrowding, or high traffic. Be succinct.'
    },
    {
        id: 'incidents',
        label: 'Critical Issues',
        instruction: 'Synthesize and summarize specific unique accidents, safety breaches, or recurring mechanical failures into a single analytical paragraph. Mention specific spots or dates if found.'
    },
    {
        id: 'suggestions',
        label: 'Actionable Suggestions',
        instruction: 'Identify and list specific passenger requests for new routes, facility upgrades, or service changes. Focus on "should", "could", and "please" statements.'
    }
];

export async function generateFullReport(
    data: any[],
    apiKey: string
): Promise<Record<string, string>> {
    const sectionRelevantData = data
        .sort((a, b) => (Number(b['Total Engagements']) || 0) - (Number(a['Total Engagements']) || 0))
        .slice(0, 40); // Sample top 40 for context to stay within token limits and keep it fast

    const contextText = sectionRelevantData
        .map(t => t['cleaned tweet'] || t['tweet'] || t['tweet content'])
        .filter(Boolean)
        .join('\n- ');

    try {
        const genAI = new GoogleGenerativeAI(apiKey);
        // Use gemini-1.5-flash for best cost/performance in free tier
        const model = genAI.getGenerativeModel({
            model: 'gemini-3-flash',
            generationConfig: {
                responseMimeType: "application/json",
            }
        });

        const prompt = `You are a Lagos Transit Intelligence Analyst.
Task: Provide a BRIEF (one paragraph) and SPECIFIC analysis for ${REPORT_SECTIONS.length} key transit categories based on the provided data.

Categories to analyze:
${REPORT_SECTIONS.map(s => `- ${s.label} (ID: ${s.id}): ${s.instruction}`).join('\n')}

Rules:
1. Provide ONLY one paragraph per category.
2. DO NOT mention statistics (e.g., "50% of users").
3. DO NOT use markdown formatting (no stars, no bold).
4. Be succinct, professional, and factual.
5. If no specific information is found for a category, use: "No specific reports found for this focus area in the current dataset."
6. Return a valid JSON object where keys are the Category IDs and values are the analysis strings.

Data Context (Top Reports):
${contextText}`;

        const result = await model.generateContent(prompt);
        const responseText = result.response.text();
        const parsed = JSON.parse(responseText);

        // Cleanup results
        const cleaned: Record<string, string> = {};
        REPORT_SECTIONS.forEach(section => {
            let content = parsed[section.id] || parsed[section.label] || 'Analysis temporarily unavailable.';
            content = content
                .replace(/\*/g, '')
                .replace(/^- /mg, '')
                .replace(/^Analysis:/i, '')
                .trim();
            cleaned[section.id] = content;
        });

        return cleaned;
    } catch (error: any) {
        console.error(`Error generating full report:`, error);
        throw error;
    }
}

export async function generateReportSection(
    section: typeof REPORT_SECTIONS[0],
    data: any[],
    sentimentSummary: string,
    topTags: string,
    apiKey: string
): Promise<string> {
    // Keep this for individual section regenerations if needed
    // Use the same model for consistency
    const sectionRelevantData = data
        .sort((a, b) => (Number(b['Total Engagements']) || 0) - (Number(a['Total Engagements']) || 0))
        .slice(0, 20);

    const contextText = sectionRelevantData
        .map(t => t['cleaned tweet'] || t['tweet'] || t['tweet content'])
        .filter(Boolean)
        .join('\n- ');

    try {
        const genAI = new GoogleGenerativeAI(apiKey);
        const model = genAI.getGenerativeModel({ model: 'gemini-3-flash' });

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
