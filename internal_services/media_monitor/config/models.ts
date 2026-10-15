export interface EmbeddingModel {
  id: string;
  displayName: string;
  dimension: number;
}

export const EMBEDDING_MODELS: Record<string, EmbeddingModel> = {
  "sentence-transformers/all-MiniLM-L6-v2": {
    id: "sentence-transformers/all-MiniLM-L6-v2",
    displayName: "MiniLM",
    dimension: 384,
  },
  "intfloat/multilingual-e5-base": {
    id: "intfloat/multilingual-e5-base",
    displayName: "E5-base",
    dimension: 768,
  },
  "BAAI/bge-m3": {
    id: "BAAI/bge-m3",
    displayName: "BGE-M3",
    dimension: 1024,
  },
  "Qwen/Qwen3-Embedding-8B": {
    id: "Qwen/Qwen3-Embedding-8B",
    displayName: "Qwen3",
    dimension: 4096,
  },
  "intfloat/multilingual-e5-base__official_retrieval": {
    id: "intfloat/multilingual-e5-base__official_retrieval",
    displayName: "E5 (Official Retrieval)",
    dimension: 768,
  },
};

export const ST_EMBEDDING_MODELS: Record<string, EmbeddingModel> = {
  "sentence-transformers/all-MiniLM-L6-v2": {
    id: "sentence-transformers/all-MiniLM-L6-v2",
    displayName: "all-MiniLM-L6-v2",
    dimension: 384,
  },
  "sentence-transformers/all-MiniLM-L12-v2": {
    id: "sentence-transformers/all-MiniLM-L12-v2",
    displayName: "all-MiniLM-L12-v2",
    dimension: 384,
  },
  "sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2": {
    id: "sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2",
    displayName: "paraphrase-multilingual-MiniLM-L12-v2",
    dimension: 384,
  },
  "sentence-transformers/all-mpnet-base-v2": {
    id: "sentence-transformers/all-mpnet-base-v2",
    displayName: "all-mpnet-base-v2",
    dimension: 768,
  },
};

export const DEFAULT_EMBEDDING_MODEL = "sentence-transformers/all-MiniLM-L6-v2";
export const DEFAULT_THREAD_EMBEDDING_MODEL = "intfloat/multilingual-e5-base";
