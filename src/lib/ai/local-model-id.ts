/**
 * On-device (in-browser) language model used by every AI feature on TeachX.
 * Runs with WebLLM on the visitor's GPU (WebGPU) — no server, no API keys, nothing sent to the cloud.
 * Llama 3.2 3B is the most capable option that still fits typical desktop WebGPU memory.
 */
export const MODEL_ID = "Llama-3.2-3B-Instruct-q4f16_1-MLC";
export const MODEL_LABEL = "Llama 3.2 3B";
/** Approximate one-time download size shown to users before they enable it. */
export const MODEL_DOWNLOAD_LABEL = "about 2 GB";
/** Hugging Face resolve path used for interrupted-download recovery in the model worker. */
export const MODEL_HF_PATH = `/mlc-ai/${MODEL_ID}/resolve/`;
