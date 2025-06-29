export const formatToolName = (name: string): string => {
  return name
    .replace(/-/g, ' ')
    .replace(/_/g, ' ')
    .split(' ')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
};

export const cleanDescription = (text: string): string => {
  if (!text) return 'No description available';

  return text
    .replace(/\[See the docs?\]/gi, '')
    .replace(/\[See the docs here\]/gi, '')
    .replace(/\[See the documentation\]/gi, '')
    .replace(/See the docs?/gi, '')
    .replace(/See the documentation/gi, '')
    .replace(/IMPORTANT:[\s\S]*?format:\s*string/gi, '')
    .replace(/\s*for more information/gi, '')
    .replace(/\s*-\s*cc:[\s\S]*?format:\s*string/gi, '')
    .replace(/\s*-\s*bcc:[\s\S]*?format:\s*string/gi, '')
    .replace(/\s*-\s*attachment[\s\S]*?format:\s*string/gi, '')
    .replace(/\s*-?\s*safetySettings[\s\S]*/gi, '')
    .replace(/\s*-?\s*safety_settings[\s\S]*/gi, '')
    .replace(/\s*-?\s*mediaPaths[\s\S]*/gi, '')
    .replace(/\s*-?\s*media_paths[\s\S]*/gi, '')
    .replace(/\s*-?\s*Return JSON in this format[\s\S]*/gi, '')
    .replace(/\s*-?\s*format:\s*string[\s\S]*/gi, '')
    .replace(/https:\/\/[^\s)]+/g, '')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/\(\s*\)/g, '')
    .replace(/\[\s*\]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/,\s*$/, '.')
    .replace(/\.\s*\.\s*$/, '.');
};
