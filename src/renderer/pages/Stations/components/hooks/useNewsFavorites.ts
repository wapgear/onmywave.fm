import { useMutation, useQueryClient } from '@tanstack/react-query';

import { canonicalArticleUrl } from '../../../../../shared/news-pool';
import type { NewsArticle, PreparedNewsLibrary } from '../../../../../shared/types';
import { unwrap } from '../../../../api';

export function useNewsFavorites(library: PreparedNewsLibrary) {
  const client = useQueryClient();
  const favorites = library.favorites ?? [];
  const mutation = useMutation({
    mutationFn: async (input: { article: NewsArticle; favorite: boolean }) =>
      unwrap(await window.wave.setNewsFavorite(input)),
    onSuccess: async (saved) => {
      client.setQueryData<PreparedNewsLibrary>(['preparedNews'], (current) =>
        current ? { ...current, favorites: saved.favorites ?? [] } : current,
      );
      await client.invalidateQueries({ queryKey: ['preparedNews'] });
    },
  });

  function isFavorite(article: NewsArticle) {
    const url = canonicalArticleUrl(article.url);
    return !!url && favorites.some((favorite) => favorite.canonicalUrl === url);
  }

  return {
    favorites,
    isFavorite,
    pending: mutation.isPending,
    error: mutation.error,
    toggle: (article: NewsArticle, onSuccess?: () => void) =>
      mutation.mutate({ article, favorite: !isFavorite(article) }, { onSuccess }),
  };
}
