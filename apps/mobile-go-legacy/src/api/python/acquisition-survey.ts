// @/src/api/python/acquisition-survey.ts

import { PYTHON_SERVER } from '.';

export async function submitAcquisitionSurvey(userId: number, acquisitionSource: string, acquisitionDetails: string | null) {
    const response = await fetch(`${PYTHON_SERVER}/acquisition_survey`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ user_id: userId, acquisition_source: acquisitionSource, acquisition_details: acquisitionDetails }),
    });

    if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to submit acquisition survey');
    }

    return await response.json();
}
