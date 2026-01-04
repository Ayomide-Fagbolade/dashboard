import { HfInference } from '@huggingface/inference';

export interface AISection {
    id: string;
    label: string;
    content: string;
}

export const REPORT_SECTIONS = [
    {
        id: 'hotspots',
        label: 'Transit Hotspots',
        instruction: 'Summarize specific locations, terminals, or stations experiencing bottlenecks, overcrowding, or high traffic. Be precise.',
        keywords: ['terminal', 'station', 'bus stop', 'overcrowd', 'traffic', 'bottleneck', 'ikorodu', 'oshodi', 'tbs', 'berger', 'mile 12', 'abule egba']
    },
    {
        id: 'incidents',
        label: 'Critical Incidents',
        instruction: 'Synthesize and summarize specific unique accidents, safety breaches, or recurring mechanical failures into a single analytical paragraph. Mention specific spots or dates if found.',
        keywords: ['accident', 'failed', 'broken', 'fire', 'crisis', 'emergency', 'delay', 'stuck', 'fault', 'crashed', 'police', 'robbery']
    },
    {
        id: 'conduct',
        label: 'Staff & Operator Audit',
        instruction: 'Analyze mentions of driver behavior, terminal staff conduct, or professional ethics. Focus on complaints or praises.',
        keywords: ['driver', 'staff', 'attendant', 'official', 'rude', 'behavior', 'professional', 'conduct', 'extortion']
    },
    {
        id: 'safety',
        label: 'Accessibility & Safety',
        instruction: 'Audit concerns regarding security, lighting, harassment, or inclusivity for the elderly and disabled.',
        keywords: ['security', 'safety', 'harassment', 'theft', 'lighting', 'dark', 'elderly', 'disabled', 'woman', 'danger']
    },
    {
        id: 'infrastructure',
        label: 'Infrastructure & Equipment',
        instruction: 'Audit the state of ACs, buses, payment (Cowry) systems, and terminal facilities.',
        keywords: ['ac', 'air condition', 'cowry', 'payment', 'card', 'bus', 'seat', 'engine', 'maintenance']
    },
    {
        id: 'suggestions',
        label: 'Actionable Suggestions',
        instruction: 'Identify and list specific passenger requests for new routes, facility upgrades, or service changes. Focus on "should", "could", and "please" statements.',
        keywords: ['should', 'need', 'improve', 'please', 'suggest', 'recommend', 'could', 'would like', 'fix', 'add', 'deploy', 'extend']
    }
];

export async function generateReportSection(
    section: typeof REPORT_SECTIONS[0],
    data: any[],
    sentimentSummary: string,
    topTags: string,
    token: string
): Promise<string> {
    const hf = new HfInference(token);

    // Filter context specifically for this section to avoid yapping about irrelevant data
    let sectionRelevantData = data.filter(t => {
        const text = (t['cleaned tweet'] || t['tweet'] || '').toLowerCase();
        return section.keywords.some(kw => text.includes(kw));
    });

    // If no specific results, fall back to top engaged negative for critical sections, or just top engaged
    if (sectionRelevantData.length === 0) {
        sectionRelevantData = data
            .sort((a, b) => (Number(b['Total Engagements']) || 0) - (Number(a['Total Engagements']) || 0))
            .slice(0, 15);
    } else {
        sectionRelevantData = sectionRelevantData
            .sort((a, b) => (Number(b['Total Engagements']) || 0) - (Number(a['Total Engagements']) || 0))
            .slice(0, 15);
    }

    const contextText = sectionRelevantData
        .map(t => t['cleaned tweet'])
        .join('\n- ');

    // Use a much stricter Llama 3 Instruct-style prompt
    const prompt = `<|begin_of_text|><|start_header_id|>system<|end_header_id|>
You are a Lagos Transit Intelligence Analyst.
Your task is to provide a BRIEF and SPECIFIC analysis for the given category.
RULES:
1. Provide ONLY the analysis paragraph.
2. DO NOT mention statistics (like counts of positive/negative).
3. DO NOT repeat the instructions or mention "Output Rules".
4. DO NOT use markdown stars (**) or dashes (-).
5. Be succinct.
6. If no specific information is found in the Data Context for this category, return exactly: "No specific reports found for this focus area in the current dataset."

CRITICAL RULE: Ignore the volume of data; extract ONLY the specific qualitative details (locations, specific complaints, or unique suggestions) from the Data Context above.<|eot_id|>
<|start_header_id|>user<|end_header_id|>
Category: ${section.label}
Instruction: ${section.instruction}

Data Context (Top Reports for this Category):
${contextText}<|eot_id|>
<|start_header_id|>assistant<|end_header_id|>
Analysis:`;

    try {
        const response = await hf.textGeneration({
            model: 'meta-llama/Llama-3.1-8B',
            inputs: prompt,
            parameters: {
                max_new_tokens: 250,
                temperature: 0.0001, // Near zero for factual extraction
                stop_sequences: ['<|eot_id|>', 'Category:', 'Data Context:']
            }
        });

        let text = response.generated_text;

        // Remove the prompt itself if returned (some HF models do this)
        if (text.includes(prompt.slice(-20))) {
            text = text.split(prompt.slice(-20)).pop() || text;
        }

        // Strip everything before the actual analysis
        if (text.includes('Analysis:')) {
            text = text.split('Analysis:').pop() || '';
        }

        // Final cleanup of common artifacts, metadata leakage, and incomplete sentences at the very end
        text = text
            .replace(/\*/g, '') // Corrected from /\*/f to /\*/g for global replacement
            .replace(/^- /mg, '')
            .replace(/Input Context:[\s\S]*$/i, '')
            .replace(/Output Rules:[\s\S]*$/i, '')
            .replace(/Data Context \(Top Reports for this Category\):[\s\S]*$/i, '')
            .trim();

        // If it still ends with half a sentence (no punctuation), try to trim to last valid punctuation
        if (text.length > 0 && !/[.!?]$/.test(text)) {
            const lastPunc = Math.max(text.lastIndexOf('.'), text.lastIndexOf('!'), text.lastIndexOf('?'));
            if (lastPunc > 0) {
                text = text.substring(0, lastPunc + 1);
            }
        }

        return text || 'No specific reports found for this focus area in the current dataset.';
    } catch (error: any) {
        console.error(`Error generating section ${section.id}:`, error);
        return 'Analysis temporarily unavailable.';
    }
}
