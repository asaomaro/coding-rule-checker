# コーディングルールチェッカー

このリポジトリは、VSCode拡張機能「コーディングルールチェーカー」の開発プロジェクトです。

## 概要

コーディングルールチェッカーは、Markdown形式で記述されたカスタムルールに基づき、AI（GitHub Copilot）を使用してコードを静的に解析・レビューするVSCode拡張機能です。

拡張機能の詳しい機能や使用方法については、以下のドキュメントを参照してください。

- **[拡張機能ドキュメント (extension/README.md)](extension/README.md)**

## プロジェクト構造

```
.
├── extension/              # VSCode拡張機能のソース
│   ├── src/               # TypeScriptソースファイル
│   ├── dist/              # コンパイル済みJavaScript
│   └── package.json       # 拡張機能マニフェスト
├── .vscode/
│   └── coding-rule-checker/  # サンプル設定
├── docs/
│   └── coding-rule.md     # ルール記述ガイド
├── spec.md                # 詳細仕様書
└── README.md              # このファイル
```

## 開発ガイド

### 必要なツール

- VSCode 1.85.0 以上
- Node.js 20+
- `gh` CLI (GitHub連携機能のテスト用)

### セットアップ

```bash
cd extension
npm install
```

### ビルドと実行

VSCodeでこのプロジェクトを開き、`F5`キーを押すと、拡張機能開発ホストが起動し、拡張機能をデバッグできます。

主な開発用コマンド (`extension`ディレクトリで実行):

- **コンパイル**: `npm run compile`
- **ウォッチモード**: `npm run watch`
- **リント**: `npm run lint`
- **パッケージ化**: `npm run package` (VSIXファイルを生成)

## ドキュメント

- [spec.md](spec.md) - 詳細仕様書（日本語）
- [extension/README.md](extension/README.md) - 拡張機能のユーザー向けドキュメント
- [docs/coding-rule.md](docs/coding-rule.md) - コーディングルール記述ガイド
- [DEBUG-GUIDE.md](DEBUG-GUIDE.md) - デバッグガイド
- [CLAUDE.md](CLAUDE.md) - AI開発ガイド (Claude向け)
