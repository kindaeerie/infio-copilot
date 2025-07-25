export type SqlMigration = {
	description: string;
	sql: string;
}

export const migrations: Record<string, SqlMigration> = {
	vector: {
		description: "Creates vector tables and indexes for different models",
		sql: `
            -- Enable required extensions
            CREATE EXTENSION IF NOT EXISTS vector;

            -- Create vector tables for different models
            CREATE TABLE IF NOT EXISTS "embeddings_1536" (
                "id" serial PRIMARY KEY NOT NULL,
                "path" text NOT NULL,
                "mtime" bigint NOT NULL,
                "content" text NOT NULL,
                "embedding" vector(1536),
                "metadata" jsonb NOT NULL
            );

			CREATE TABLE IF NOT EXISTS "embeddings_1024" (
				"id" serial PRIMARY KEY NOT NULL,
				"path" text NOT NULL,
				"mtime" bigint NOT NULL,
				"content" text NOT NULL,
				"embedding" vector(1024),
				"metadata" jsonb NOT NULL
			);

            CREATE TABLE IF NOT EXISTS "embeddings_768" (
                "id" serial PRIMARY KEY NOT NULL,
                "path" text NOT NULL,
                "mtime" bigint NOT NULL,
                "content" text NOT NULL,
                "embedding" vector(768),
                "metadata" jsonb NOT NULL
            );

			CREATE TABLE IF NOT EXISTS "embeddings_512" (
                "id" serial PRIMARY KEY NOT NULL,
                "path" text NOT NULL,
                "mtime" bigint NOT NULL,
                "content" text NOT NULL,
                "embedding" vector(512),
                "metadata" jsonb NOT NULL
            );

			CREATE TABLE IF NOT EXISTS "embeddings_384" (
                "id" serial PRIMARY KEY NOT NULL,
                "path" text NOT NULL,
                "mtime" bigint NOT NULL,
                "content" text NOT NULL,
                "embedding" vector(384),
                "metadata" jsonb NOT NULL
            );

            -- Create HNSW indexes for vector similarity search
            CREATE INDEX IF NOT EXISTS "embeddingIndex_1536" 
            ON "embeddings_1536" 
            USING hnsw ("embedding" vector_cosine_ops);

            CREATE INDEX IF NOT EXISTS "embeddingIndex_1024" 
            ON "embeddings_1024" 
            USING hnsw ("embedding" vector_cosine_ops);

			CREATE INDEX IF NOT EXISTS "embeddingIndex_768"
            ON "embeddings_768" 
            USING hnsw ("embedding" vector_cosine_ops);

			CREATE INDEX IF NOT EXISTS "embeddingIndex_512"
			ON "embeddings_512"
			USING hnsw ("embedding" vector_cosine_ops);

			CREATE INDEX IF NOT EXISTS "embeddingIndex_384"
			ON "embeddings_384"
			USING hnsw ("embedding" vector_cosine_ops);

            -- Create B-tree indexes for path field to optimize file path queries
            CREATE INDEX IF NOT EXISTS "pathIndex_1536" 
            ON "embeddings_1536" ("path");

            CREATE INDEX IF NOT EXISTS "pathIndex_1024" 
            ON "embeddings_1024" ("path");

            CREATE INDEX IF NOT EXISTS "pathIndex_768" 
            ON "embeddings_768" ("path");

            CREATE INDEX IF NOT EXISTS "pathIndex_512" 
            ON "embeddings_512" ("path");

            CREATE INDEX IF NOT EXISTS "pathIndex_384" 
            ON "embeddings_384" ("path");
        `
	},
	source_insight: {
		description: "Creates source insight tables and indexes for different embedding models",
		sql: `
            -- Create source insight tables for different embedding dimensions
            CREATE TABLE IF NOT EXISTS "source_insight_1536" (
                "id" serial PRIMARY KEY NOT NULL,
                "insight_type" text NOT NULL,
                "insight" text NOT NULL,
                "source_type" text NOT NULL,
                "source_path" text NOT NULL,
                "source_mtime" bigint NOT NULL,
                "embedding" vector(1536),
                "created_at" timestamp DEFAULT now() NOT NULL,
                "updated_at" timestamp DEFAULT now() NOT NULL
            );

            CREATE TABLE IF NOT EXISTS "source_insight_1024" (
                "id" serial PRIMARY KEY NOT NULL,
                "insight_type" text NOT NULL,
                "insight" text NOT NULL,
                "source_type" text NOT NULL,
                "source_path" text NOT NULL,
                "source_mtime" bigint NOT NULL,
                "embedding" vector(1024),
                "created_at" timestamp DEFAULT now() NOT NULL,
                "updated_at" timestamp DEFAULT now() NOT NULL
            );

            CREATE TABLE IF NOT EXISTS "source_insight_768" (
                "id" serial PRIMARY KEY NOT NULL,
                "insight_type" text NOT NULL,
                "insight" text NOT NULL,
                "source_type" text NOT NULL,
                "source_path" text NOT NULL,
                "source_mtime" bigint NOT NULL,
                "embedding" vector(768),
                "created_at" timestamp DEFAULT now() NOT NULL,
                "updated_at" timestamp DEFAULT now() NOT NULL
            );

            CREATE TABLE IF NOT EXISTS "source_insight_512" (
                "id" serial PRIMARY KEY NOT NULL,
                "insight_type" text NOT NULL,
                "insight" text NOT NULL,
                "source_type" text NOT NULL,
                "source_path" text NOT NULL,
                "source_mtime" bigint NOT NULL,
                "embedding" vector(512),
                "created_at" timestamp DEFAULT now() NOT NULL,
                "updated_at" timestamp DEFAULT now() NOT NULL
            );

            CREATE TABLE IF NOT EXISTS "source_insight_384" (
                "id" serial PRIMARY KEY NOT NULL,
                "insight_type" text NOT NULL,
                "insight" text NOT NULL,
                "source_type" text NOT NULL,
                "source_path" text NOT NULL,
                "source_mtime" bigint NOT NULL,
                "embedding" vector(384),
                "created_at" timestamp DEFAULT now() NOT NULL,
                "updated_at" timestamp DEFAULT now() NOT NULL
            );

            -- Create HNSW indexes for embedding similarity search
            CREATE INDEX IF NOT EXISTS "insightEmbeddingIndex_1536"
            ON "source_insight_1536"
            USING hnsw ("embedding" vector_cosine_ops);

            CREATE INDEX IF NOT EXISTS "insightEmbeddingIndex_1024"
            ON "source_insight_1024"
            USING hnsw ("embedding" vector_cosine_ops);

            CREATE INDEX IF NOT EXISTS "insightEmbeddingIndex_768"
            ON "source_insight_768"
            USING hnsw ("embedding" vector_cosine_ops);

            CREATE INDEX IF NOT EXISTS "insightEmbeddingIndex_512"
            ON "source_insight_512"
            USING hnsw ("embedding" vector_cosine_ops);

            CREATE INDEX IF NOT EXISTS "insightEmbeddingIndex_384"
            ON "source_insight_384"
            USING hnsw ("embedding" vector_cosine_ops);

            -- Create B-tree indexes for source_path field
            CREATE INDEX IF NOT EXISTS "insightSourceIndex_1536"
            ON "source_insight_1536" ("source_path");

            CREATE INDEX IF NOT EXISTS "insightSourceIndex_1024"
            ON "source_insight_1024" ("source_path");

            CREATE INDEX IF NOT EXISTS "insightSourceIndex_768"
            ON "source_insight_768" ("source_path");

            CREATE INDEX IF NOT EXISTS "insightSourceIndex_512"
            ON "source_insight_512" ("source_path");

            CREATE INDEX IF NOT EXISTS "insightSourceIndex_384"
            ON "source_insight_384" ("source_path");

            -- Create B-tree indexes for insight_type field
            CREATE INDEX IF NOT EXISTS "insightTypeIndex_1536"
            ON "source_insight_1536" ("insight_type");

            CREATE INDEX IF NOT EXISTS "insightTypeIndex_1024"
            ON "source_insight_1024" ("insight_type");

            CREATE INDEX IF NOT EXISTS "insightTypeIndex_768"
            ON "source_insight_768" ("insight_type");

            CREATE INDEX IF NOT EXISTS "insightTypeIndex_512"
            ON "source_insight_512" ("insight_type");

            CREATE INDEX IF NOT EXISTS "insightTypeIndex_384"
            ON "source_insight_384" ("insight_type");
        `
	},
	template: {
		description: "Creates template table with UUID support",
		sql: `
            -- Create template table
            CREATE TABLE IF NOT EXISTS "template" (
                "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
                "name" text NOT NULL,
                "content" jsonb NOT NULL,
                "created_at" timestamp DEFAULT now() NOT NULL,
                "updated_at" timestamp DEFAULT now() NOT NULL,
                CONSTRAINT "template_name_unique" UNIQUE("name")
            );
        `
	},
	conversation: {
		description: "Creates conversations and messages tables",
		sql: `
            CREATE TABLE IF NOT EXISTS "conversations" (
                "id" uuid PRIMARY KEY NOT NULL,
                "title" text NOT NULL,
                "created_at" timestamp DEFAULT now() NOT NULL,
                "updated_at" timestamp DEFAULT now() NOT NULL
            );

            CREATE TABLE IF NOT EXISTS "messages" (
                "id" uuid PRIMARY KEY NOT NULL,
                "conversation_id" uuid NOT NULL REFERENCES "conversations"("id") ON DELETE CASCADE,
								"apply_status" integer NOT NULL DEFAULT 0,
                "role" text NOT NULL,
                "content" text,
                "reasoning_content" text,
                "prompt_content" text,
                "metadata" text,
                "mentionables" text,
                "similarity_search_results" text,
                "created_at" timestamp DEFAULT now() NOT NULL
            );
        `
	},
	add_source_mtime: {
		description: "Adds missing source_mtime column to existing source insight tables",
		sql: `
            -- Add source_mtime column to existing source insight tables if it doesn't exist
            ALTER TABLE "source_insight_1536" ADD COLUMN IF NOT EXISTS "source_mtime" bigint NOT NULL DEFAULT 0;
            ALTER TABLE "source_insight_1024" ADD COLUMN IF NOT EXISTS "source_mtime" bigint NOT NULL DEFAULT 0;
            ALTER TABLE "source_insight_768" ADD COLUMN IF NOT EXISTS "source_mtime" bigint NOT NULL DEFAULT 0;
            ALTER TABLE "source_insight_512" ADD COLUMN IF NOT EXISTS "source_mtime" bigint NOT NULL DEFAULT 0;
            ALTER TABLE "source_insight_384" ADD COLUMN IF NOT EXISTS "source_mtime" bigint NOT NULL DEFAULT 0;
        `
	},
	full_text_search: {
		description: "Adds full-text search capabilities to embedding and source insight tables",
		sql: `
            -- Add content_tsv columns to embedding tables
            ALTER TABLE "embeddings_1536" ADD COLUMN IF NOT EXISTS "content_tsv" TSVECTOR;
            ALTER TABLE "embeddings_1024" ADD COLUMN IF NOT EXISTS "content_tsv" TSVECTOR;
            ALTER TABLE "embeddings_768" ADD COLUMN IF NOT EXISTS "content_tsv" TSVECTOR;
            ALTER TABLE "embeddings_512" ADD COLUMN IF NOT EXISTS "content_tsv" TSVECTOR;
            ALTER TABLE "embeddings_384" ADD COLUMN IF NOT EXISTS "content_tsv" TSVECTOR;

            -- Add insight_tsv columns to source insight tables
            ALTER TABLE "source_insight_1536" ADD COLUMN IF NOT EXISTS "insight_tsv" TSVECTOR;
            ALTER TABLE "source_insight_1024" ADD COLUMN IF NOT EXISTS "insight_tsv" TSVECTOR;
            ALTER TABLE "source_insight_768" ADD COLUMN IF NOT EXISTS "insight_tsv" TSVECTOR;
            ALTER TABLE "source_insight_512" ADD COLUMN IF NOT EXISTS "insight_tsv" TSVECTOR;
            ALTER TABLE "source_insight_384" ADD COLUMN IF NOT EXISTS "insight_tsv" TSVECTOR;

            -- Create trigger function for embeddings tables
            CREATE OR REPLACE FUNCTION embeddings_tsv_trigger() RETURNS trigger AS $$
            BEGIN
                NEW.content_tsv := to_tsvector('english', coalesce(NEW.content, ''));
                RETURN NEW;
            END
            $$ LANGUAGE plpgsql;

            -- Create trigger function for source insight tables
            CREATE OR REPLACE FUNCTION source_insight_tsv_trigger() RETURNS trigger AS $$
            BEGIN
                NEW.insight_tsv := to_tsvector('english', coalesce(NEW.insight, ''));
                RETURN NEW;
            END
            $$ LANGUAGE plpgsql;

            -- Create triggers for embeddings tables (drop if exists first)
            DROP TRIGGER IF EXISTS tsvector_update_embeddings_1536 ON "embeddings_1536";
            CREATE TRIGGER tsvector_update_embeddings_1536
            BEFORE INSERT OR UPDATE ON "embeddings_1536"
            FOR EACH ROW EXECUTE FUNCTION embeddings_tsv_trigger();

            DROP TRIGGER IF EXISTS tsvector_update_embeddings_1024 ON "embeddings_1024";
            CREATE TRIGGER tsvector_update_embeddings_1024
            BEFORE INSERT OR UPDATE ON "embeddings_1024"
            FOR EACH ROW EXECUTE FUNCTION embeddings_tsv_trigger();

            DROP TRIGGER IF EXISTS tsvector_update_embeddings_768 ON "embeddings_768";
            CREATE TRIGGER tsvector_update_embeddings_768
            BEFORE INSERT OR UPDATE ON "embeddings_768"
            FOR EACH ROW EXECUTE FUNCTION embeddings_tsv_trigger();

            DROP TRIGGER IF EXISTS tsvector_update_embeddings_512 ON "embeddings_512";
            CREATE TRIGGER tsvector_update_embeddings_512
            BEFORE INSERT OR UPDATE ON "embeddings_512"
            FOR EACH ROW EXECUTE FUNCTION embeddings_tsv_trigger();

            DROP TRIGGER IF EXISTS tsvector_update_embeddings_384 ON "embeddings_384";
            CREATE TRIGGER tsvector_update_embeddings_384
            BEFORE INSERT OR UPDATE ON "embeddings_384"
            FOR EACH ROW EXECUTE FUNCTION embeddings_tsv_trigger();

            -- Create triggers for source insight tables (drop if exists first)
            DROP TRIGGER IF EXISTS tsvector_update_source_insight_1536 ON "source_insight_1536";
            CREATE TRIGGER tsvector_update_source_insight_1536
            BEFORE INSERT OR UPDATE ON "source_insight_1536"
            FOR EACH ROW EXECUTE FUNCTION source_insight_tsv_trigger();

            DROP TRIGGER IF EXISTS tsvector_update_source_insight_1024 ON "source_insight_1024";
            CREATE TRIGGER tsvector_update_source_insight_1024
            BEFORE INSERT OR UPDATE ON "source_insight_1024"
            FOR EACH ROW EXECUTE FUNCTION source_insight_tsv_trigger();

            DROP TRIGGER IF EXISTS tsvector_update_source_insight_768 ON "source_insight_768";
            CREATE TRIGGER tsvector_update_source_insight_768
            BEFORE INSERT OR UPDATE ON "source_insight_768"
            FOR EACH ROW EXECUTE FUNCTION source_insight_tsv_trigger();

            DROP TRIGGER IF EXISTS tsvector_update_source_insight_512 ON "source_insight_512";
            CREATE TRIGGER tsvector_update_source_insight_512
            BEFORE INSERT OR UPDATE ON "source_insight_512"
            FOR EACH ROW EXECUTE FUNCTION source_insight_tsv_trigger();

            DROP TRIGGER IF EXISTS tsvector_update_source_insight_384 ON "source_insight_384";
            CREATE TRIGGER tsvector_update_source_insight_384
            BEFORE INSERT OR UPDATE ON "source_insight_384"
            FOR EACH ROW EXECUTE FUNCTION source_insight_tsv_trigger();

            -- Note: 现有数据的 tsvector 字段将保持为 NULL，只有新插入的数据会通过 trigger 自动填充
            -- 这样可以避免大量 UPDATE 操作导致的文件句柄耗尽问题

            -- Create GIN indexes for full-text search on embeddings tables
            CREATE INDEX IF NOT EXISTS "embeddings_content_tsv_idx_1536" ON "embeddings_1536" USING GIN(content_tsv);
            CREATE INDEX IF NOT EXISTS "embeddings_content_tsv_idx_1024" ON "embeddings_1024" USING GIN(content_tsv);
            CREATE INDEX IF NOT EXISTS "embeddings_content_tsv_idx_768" ON "embeddings_768" USING GIN(content_tsv);
            CREATE INDEX IF NOT EXISTS "embeddings_content_tsv_idx_512" ON "embeddings_512" USING GIN(content_tsv);
            CREATE INDEX IF NOT EXISTS "embeddings_content_tsv_idx_384" ON "embeddings_384" USING GIN(content_tsv);

            -- Create GIN indexes for full-text search on source insight tables
            CREATE INDEX IF NOT EXISTS "source_insight_tsv_idx_1536" ON "source_insight_1536" USING GIN(insight_tsv);
            CREATE INDEX IF NOT EXISTS "source_insight_tsv_idx_1024" ON "source_insight_1024" USING GIN(insight_tsv);
            CREATE INDEX IF NOT EXISTS "source_insight_tsv_idx_768" ON "source_insight_768" USING GIN(insight_tsv);
            CREATE INDEX IF NOT EXISTS "source_insight_tsv_idx_512" ON "source_insight_512" USING GIN(insight_tsv);
            CREATE INDEX IF NOT EXISTS "source_insight_tsv_idx_384" ON "source_insight_384" USING GIN(insight_tsv);
        `
	}
};
