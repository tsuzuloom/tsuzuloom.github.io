-- キャラクター画像のバケットを非公開にする（2026-11-14 実行済み）
-- アプリ側は署名付きURL（createSignedUrls）で表示する。本人用の SELECT ポリシー（char_images_read_own）が前提。
update storage.buckets set public = false where id = 'character-images';
