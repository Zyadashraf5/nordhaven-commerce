# M14 data model

No new business entities, schema migrations or production configuration in M14. Existing26-migration owned schema is retained. Runtime protection is configuration validation. Restore archives/manifests and delivery staging files are local operational artifacts. A SKIPPED notification canary on owned dev provides non-empty restore evidence and is never dispatched. New restored database is retained rather than reusing or destroying any database.
