declare module 'mammoth' {
  export interface MammothResult {
    value: string;
    messages: Array<{ type: string; message: string }>;
  }
  export function convertToHtml(input: {
    buffer?: Buffer;
    arrayBuffer?: ArrayBuffer;
    path?: string;
  }): Promise<MammothResult>;
  export function extractRawText(input: {
    buffer?: Buffer;
    arrayBuffer?: ArrayBuffer;
    path?: string;
  }): Promise<MammothResult>;
}
