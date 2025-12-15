# コーディングルールチェッカー

Markdown形式で記述されたコーディングルールに基づき、GitHub Copilot Chatと連携して静的コード解析を行うVSCode拡張機能です。

## 概要

コーディングルールチェッカーを使用すると、カスタムのコーディングルールをMarkdown形式で定義し、AIを使用してこれらのルールに対してコードを自動的にレビューできます。GitHub Copilot Chatとシームレスに統合されており、コードレビューを簡単かつ効率的に行えます。

## 主な機能

- **Markdownベースのルール**: シンプルなMarkdown形式でコーディングルールを定義
- **Copilot Chat連携**: Copilot Chatから直接コードをレビュー
- **マルチソース対応**: ローカルファイル、フォルダ、git diff、またはGitHubリポジトリをレビュー
- **フォルダレビュー**: 自動除外機能付きでフォルダ内のすべてのコードファイルを再帰的にレビュー
- **並列処理**: 章ごとの並列処理による高速なレビュー
- **偽陽性検出**: 偽陽性を減らすための自動検証
- **カスタマイズ可能な出力**: レビューテンプレートと出力形式を設定可能
- **複数ルールセット**: ファイルタイプごとに異なるルールを適用

## クイックスタート

### 1. 依存関係のインストール

```bash
cd extension
npm install
```

### 2. 拡張機能のコンパイル

```bash
npm run compile
```

### 3. 設定のセットアップ

プロジェクトに `.vscode/coding-rule-checker` ディレクトリを作成し、以下を配置します:
- `settings.json` - メイン設定
- プロンプトテンプレート（system, review, false-positive）
- Markdownルールファイルを含むルールディレクトリ

サンプル設定ファイルはこのリポジトリで提供されています。

### 4. 拡張機能のインストール

1. VSCodeを開く
2. F5キーを押して拡張機能開発ホストを起動
3. または `npm run package` でパッケージ化し、.vsixファイルをインストール

### 5. Copilot Chatでの使用

#### /review コマンド（ファイル全体をレビュー）

```bash
# ローカルファイルをレビュー
@coding-rule-checker /review #file

# フォルダ内の全ファイルをレビュー（再帰的）
@coding-rule-checker /review #folder

# GitHubのファイルをレビュー
@coding-rule-checker /review https://github.com/owner/repo/blob/main/src/index.ts
```

#### /diff コマンド（差分のみをレビュー）

```bash
# 未コミットの変更をレビュー（全ファイル）
@coding-rule-checker /diff

# 未コミットの変更をレビュー（特定ファイル）
@coding-rule-checker /diff #file

# ブランチ間の差分をレビュー
@coding-rule-checker /diff main..feature #file

# コミットハッシュ間の差分をレビュー
@coding-rule-checker /diff abc123..def456 #file

# タグ間の差分をレビュー
@coding-rule-checker /diff v1.0.0..v2.0.0 #file

# GitHubコミットの差分をレビュー
@coding-rule-checker /diff https://github.com/owner/repo/commit/abc123def456

# GitHub Compare（ブランチ比較）
@coding-rule-checker /diff https://github.com/owner/repo/compare/main...feature

# プルリクエストの差分をレビュー（gh CLIを使用）
gh pr diff 123 | @coding-rule-checker /diff
```

## プロジェクト構造

```
.
├── extension/              # VSCode拡張機能のソース
│   ├── src/               # TypeScriptソースファイル
│   ├── dist/              # コンパイル済みJavaScript
│   └── package.json       # 拡張機能マニフェスト
├── .vscode/
│   └── coding-rule-checker/  # サンプル設定
│       ├── settings.json
│       ├── *-prompt.md    # プロンプトテンプレート
│       └── sample-rule/   # サンプルルールセット
│           ├── rule-settings.json
│           └── rules/     # Markdownルールファイル
├── spec.md                # 詳細仕様
└── README.md              # このファイル
```

## ドキュメント

- [spec.md](spec.md) - 詳細仕様（日本語）
- [extension/README.md](extension/README.md) - 拡張機能ドキュメント
- [CLAUDE.md](CLAUDE.md) - Claude Code用プロジェクトガイド（詳細な設定情報）

## 設定

### グローバル設定（`.vscode/coding-rule-checker/settings.json`）

```json
{
  "model": "copilot-gpt-4",
  "systemPromptPath": ".vscode/coding-rule-checker/system-prompt.md",
  "templatesPath": ".vscode/coding-rule-checker/review-results-template.md",
  "fileOutput": {
    "enabled": true,
    "outputDir": ".vscode/coding-rule-checker/review-results",
    "outputFileName": "reviewed_{originalFileName}.md"
  },
  "rulesets": {
    ".ts": ["typescript-rules"],
    ".js": ["javascript-rules"],
    "*.test.ts": ["typescript-rules", "test-rules"]
  }
}
```

#### 設定項目

| 項目 | 必須 | 説明 |
|------|------|------|
| `model` | × | 使用するLLMモデル（省略時はCopilot Chatで選択中のモデルを使用） |
| `systemPromptPath` | ○ | システムプロンプトファイルのパス |
| `templatesPath` | ○ | レビュー結果テンプレートファイルのパス |
| `fileOutput.enabled` | ○ | レビュー結果のファイル出力を有効にするか |
| `fileOutput.outputDir` | ○ | 出力先ディレクトリ |
| `fileOutput.outputFileName` | ○ | 出力ファイル名（`{originalFileName}`でファイル名を挿入可能） |
| `rulesets` | ○ | ファイルパターンとルールセットのマッピング |

### ルールセット設定（`.vscode/coding-rule-checker/[ruleset]/rule-settings.json`）

```json
{
  "rulesPath": ".vscode/coding-rule-checker/sample-rule/rules",
  "reviewPromptPath": ".vscode/coding-rule-checker/review-prompt.md",
  "falsePositivePromptPath": ".vscode/coding-rule-checker/false-positive-prompt.md",
  "commonInstructionsPath": ".vscode/coding-rule-checker/sample-rule/rules/00_common.md",
  "reviewIterations": {
    "default": 2,
    "chapter": {
      "1": 3
    }
  },
  "falsePositiveCheckIterations": {
    "default": 2,
    "chapter": {
      "1": 3
    }
  },
  "aggregationThreshold": 0.5,
  "chapterFilters": {
    "default": ["1", "2"],
    "patterns": {
      "*.test.ts": ["1", "3"]
    }
  }
}
```

#### 設定項目

| 項目 | 必須 | 説明 |
|------|------|------|
| `rulesPath` | ○ | ルールファイルが格納されているディレクトリ |
| `reviewPromptPath` | × | レビュープロンプトテンプレート（省略時はデフォルトを使用） |
| `falsePositivePromptPath` | × | 誤検知チェックプロンプトテンプレート（省略時はデフォルトを使用） |
| `commonInstructionsPath` | × | 全章共通の指示を記載したMarkdownファイル |
| `reviewIterations.default` | ○ | デフォルトのレビュー試行回数 |
| `reviewIterations.chapter` | × | 章ごとの試行回数（章番号をキーとして指定） |
| `falsePositiveCheckIterations.default` | ○ | デフォルトの誤検知チェック試行回数 |
| `falsePositiveCheckIterations.chapter` | × | 章ごとの誤検知チェック試行回数 |
| `aggregationThreshold` | × | 多数決のしきい値（0.0-1.0、デフォルト: 0.5）<br>1.0=1回でも検出で採用、0.5=過半数、0.0=全試行で検出 |
| `chapterFilters.default` | × | デフォルトでレビューする章のリスト |
| `chapterFilters.patterns` | × | ファイルパターンごとのレビュー対象章 |

### プロンプトファイル

- **system-prompt.md**: レビュアーの役割と基本ガイドラインを定義
- **review-prompt.md**: レビューリクエストのテンプレート（`{fileName}`、`{code}`、`{chapterContent}`などのプレースホルダーを使用）
- **false-positive-prompt.md**: 誤検知チェックのテンプレート
- **review-results-template.md**: 出力形式のテンプレート

## 開発

### ビルド

```bash
cd extension
npm run compile
```

### ウォッチモード

```bash
npm run watch
```

### リント

```bash
npm run lint
```

### パッケージ化

```bash
npm run package
```

## アーキテクチャ

この拡張機能は、いくつかの主要コンポーネントで構成されています:

1. **Config Manager**: 設定とルール構成を読み込みます
2. **Rule Parser**: Markdownルールファイルを構造化データに解析します
3. **Code Retriever**: ローカルファイル、フォルダ、またはGitHubからコードを取得します
4. **Review Engine**: Copilot言語モデルを使用してレビューを実行します
5. **Parallel Reviewer**: 並列レビュー処理を管理します
6. **Output Formatter**: レビュー結果をフォーマットして保存します

## 要件

- VSCode 1.85.0 以上
- GitHub Copilot サブスクリプション
- Node.js 20+ (開発用)
- `gh` CLI (GitHub連携用)

## 貢献

貢献を歓迎します！イシューやプルリクエストを気軽にサブミットしてください。

## ライセンス

MIT

## 著者

spec.mdの仕様に基づいて開発されました
