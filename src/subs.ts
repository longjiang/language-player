// @/src/subs.ts
import Papa from 'papaparse';
import { Line, SyncedLine } from '@/types';

export const  parseSubtitles = (csvData: string) => {
  const parsedSubs = Papa.parse(csvData, {
    header: true,
    dynamicTyping: true,
  }).data;
  return parsedSubs.filter((line: any) => line.starttime && line.line && line.line.toString().trim());
};



export const syncLines = (l1Lines: Line[], l2Lines: Line[]): SyncedLine[] => {
  l1Lines = Array.isArray(l1Lines) ? l1Lines : [];
  l2Lines = Array.isArray(l2Lines) ? l2Lines : [];
  // Convert starttime to numbers and sort both arrays
  l1Lines = l1Lines.sort((a, b) => a.starttime - b.starttime);
  l2Lines = l2Lines.sort((a, b) => a.starttime - b.starttime);

  const syncedLines: SyncedLine[] = [];
  const usedIndexes = new Set<number>(); // To track used l2Lines

  // Find the closest l2Line for each l1Line
  l1Lines.forEach(l1Line => {
    let closestIndex = -1;
    let smallestDifference = Infinity;

    for (let i = 0; i < l2Lines.length; i++) {
      if (!usedIndexes.has(i)) {
        const timeDifference = Math.abs(l1Line.starttime - l2Lines[i].starttime);
        if (timeDifference < smallestDifference) {
          smallestDifference = timeDifference;
          closestIndex = i;
        }
      }
    }

    if (closestIndex !== -1) {
      usedIndexes.add(closestIndex);
      syncedLines.push({
        starttime: l1Line.starttime,
        l1Line: l1Line.line,
        l2Line: l2Lines[closestIndex].line
      });
    }
  });

  // Add remaining l2Lines that were not used
  l2Lines.forEach((l2Line, index) => {
    if (!usedIndexes.has(index)) {
      syncedLines.push({
        starttime: l2Line.starttime,
        l1Line: '',
        l2Line: l2Line.line
      });
    }
  });

  // Sort the final array by starttime for consistent ordering
  syncedLines.sort((a, b) => a.starttime - b.starttime);

  return syncedLines;
}

export const findSubtitle = (currentTime: number, syncedLines: SyncedLine[]) => {
  let nearestSubtitle = null;
  for (let i = 0; i < syncedLines.length; i++) {
    if (currentTime >= syncedLines[i].starttime) {
      nearestSubtitle = syncedLines[i];
      if (i + 1 < syncedLines.length && currentTime >= syncedLines[i + 1].starttime) {
        continue;
      } else {
        break;
      }
    }
  }
  return nearestSubtitle;
};