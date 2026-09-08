import { BaseRetriever } from '@langchain/core/retrievers'
import { Document } from '@langchain/core/documents'
import { CallbackManagerForRetrieverRun } from '@langchain/core/callbacks/manager'
import { getPayloadClient } from './site-data'
import { hybridSearch } from './vectorSearch'

export class HybridSearchRetriever extends BaseRetriever {
  lc_namespace = ['langchain', 'retrievers']

  async _getRelevantDocuments(
    query: string,
    _callbacks?: CallbackManagerForRetrieverRun,
  ): Promise<Document[]> {
    const payload = await getPayloadClient()
    const matches = await hybridSearch(payload, query, { limit: 5 })
    return matches.map((m) => new Document({
      pageContent: m.content,
      metadata: { knowledgeId: m.knowledgeId, chunkId: m.chunkId, similarity: m.similarity },
    }))
  }
}
