# Extension Icon

このドキュメントでは、Coding Rule Checker拡張機能のアイコンについて説明します。

## アイコンデザイン

### コンセプト

アイコンは以下の要素で構成されています：

- 📄 **ドキュメント**: Markdownベースのコーディングルールを表現
- ✓ **チェックマーク**: コードレビューと検証を象徴
- 📏 **ルールライン**: コーディング規約を視覚化

### カラーパレット

- **メインブルー**: `#4A90E2` - プロフェッショナルで信頼性のある印象
- **アクセントグリーン**: `#5CB85C` - 成功とOKを示す
- **背景**: `#F8F9FA` - クリーンで明るい背景

## ファイル一覧

```
extension/
├── icon.svg           # ソースSVGファイル (2.4KB)
├── icon.png           # 128x128 メインアイコン (6.5KB) ★必須
├── icon-256.png       # 256x256 高解像度 (15KB)
└── icon-512.png       # 512x512 超高解像度 (34KB)
```

## アイコン生成方法

### 方法1: Node.jsスクリプト（推奨）

```bash
cd extension
npm run generate-icons
```

このコマンドで3つのサイズのPNGファイルが自動生成されます。

### 方法2: バッチファイル（Windows）

```batch
generate-icon.bat
```

ブラウザが開き、手動でPNGをダウンロードできます。

### 方法3: HTMLコンバーター

1. `extension/convert-icon.html` をブラウザで開く
2. 必要なサイズの「Download PNG」ボタンをクリック
3. ダウンロードされたファイルをextensionフォルダに保存

### 方法4: 手動変換

以下のオンラインツールを使用してSVGからPNGに変換できます：

- [CloudConvert](https://cloudconvert.com/svg-to-png)
- [Convertio](https://convertio.co/svg-png/)
- [SVG2PNG](https://svgtopng.com/)

**手順:**
1. `extension/icon.svg` をアップロード
2. サイズを128x128に設定
3. PNGに変換してダウンロード
4. `icon.png` として保存

## アイコンの要件

VSCode拡張機能のアイコンには以下の要件があります：

- **必須サイズ**: 128x128ピクセル
- **フォーマット**: PNG（推奨）またはSVG
- **ファイル名**: `icon.png`
- **場所**: extensionフォルダのルート
- **package.json設定**: `"icon": "icon.png"`

## アイコンの修正

アイコンを修正する場合は以下の手順を実行します：

1. **SVGを編集**: `extension/icon.svg` を編集
2. **スクリプトを更新**: `extension/generate-png-icon.js` の `svgContent` を更新
3. **再生成**: `npm run generate-icons` を実行
4. **確認**: 生成されたPNGファイルを確認

## SVGの編集

SVGファイルは以下のツールで編集できます：

- **Inkscape** (無料、オープンソース)
- **Adobe Illustrator** (有料)
- **Figma** (無料/有料)
- **テキストエディタ** (SVGはXMLベースなので直接編集可能)

## トラブルシューティング

### アイコンが表示されない

1. `icon.png` が `extension/` フォルダに存在するか確認
2. `package.json` の `icon` フィールドが正しく設定されているか確認
3. VSCodeを再起動

### 解像度が低い

- より大きいサイズのPNG（256x256 または 512x512）を使用
- SVGを直接使用（`"icon": "icon.svg"`）

### ビルドに含まれない

`.vscodeignore` ファイルで `icon.png` が除外されていないか確認してください。

## ベストプラクティス

- アイコンはシンプルで認識しやすいデザインに
- 128x128でも視認性が高いデザインを心がける
- 背景色は透明またはライトカラーを推奨
- 細かいディテールは避ける（小さいサイズで潰れる）
- ブランドカラーを効果的に使用

## ライセンス

このアイコンはMITライセンスの下で提供されます。
自由に修正・再配布が可能です。

---

**作成日**: 2024年12月13日
**作成者**: s.asao
**バージョン**: 0.1.0
