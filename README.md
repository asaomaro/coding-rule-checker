# コーディングルールチェッカー

Markdown形式で記述されたコーディングルールに基づき、静的コード解析を実行するVSCode拡張機能です。GitHub Copilot Chatと統合されています。

## 概要

コーディングルールチェッカーは、カスタムのコーディングルールをMarkdown形式で定義し、AIを使用してこれらのルールに対してコードを自動的にレビューすることができます。GitHub Copilot Chatとシームレスに統合されており、コードレビューを簡単かつ効率的に行えます。

## 主な機能

- **Markdownベースのルール**: シンプルなMarkdown形式でコーディングルールを定義
- **Copilot Chat連携**: 直感的なコマンドでCopilot Chatから直接コードをレビュー
- **マルチソース対応**: ローカルファイル、フォルダ、git diff、またはGitHubリポジトリをレビュー
- **複数ファイルレビュー**: 複数のファイルやフォルダ全体を一度のコマンドでレビュー
- **ルールセットの上書き**: `--ruleset`フラグで使用するルールセットを指定
- **並列処理**: 章ごとの並列処理による高速なレビュー
- **偽陽性検出**: 偽陽性を減らすための自動検証
- **カスタマイズ可能な出力**: クリック可能なリンク付きのレビューテンプレートと出力形式を設定
- **進捗追跡**: ファイルとルールセット情報をリアルタイムで表示
- **GitHub連携**: GitHubのURLから直接ファイルやdiffをレビュー

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
- プロンプトテンプレート（システム、レビュー、偽陽性、サマリー）
- Markdownルールファイルを含むルールディレクトリ

サンプル設定ファイルがこのリポジトリに提供されています。

### 4. 拡張機能のインストール

1. VSCodeを開く
2. F5キーを押して拡張機能開発ホストを起動
3. または `npm run package` でパッケージ化し、.vsixファイルをインストール

### 5. Copilot Chatでの使用

```bash
# 単一ファイルのレビュー
@coding-rule-checker /review #file

# 複数ファイルのレビュー
@coding-rule-checker /review #file1 #file2 #file3

# フォルダ全体のレビュー
@coding-rule-checker /review #folder

# 特定のルールセットでレビュー
@coding-rule-checker /review --ruleset=typescript-rules #file

# git diffのレビュー
@coding-rule-checker /diff main..feature

# GitHubファイルのレビュー
@coding-rule-checker /review https://github.com/owner/repo/blob/main/file.ts
```

詳細な例については、[使用例](#使用例)を参照してください。

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
├── spec.md                # 詳細仕様書
└── README.md              # このファイル
```

## 使用例

###基本的なファイルレビュー

```bash
# VSCodeファイル参照を使用したレビュー
@coding-rule-checker /review #file

# ファイル名パターンによるレビュー
@coding-rule-checker /review #file:UserService.java

# 複数ファイルを名前でレビュー
@coding-rule-checker /review #file:UserService.java #file:OrderController.java #file:ProductRepository.java
```

### フォルダレビュー

```bash
# フォルダ全体を再帰的にレビュー
@coding-rule-checker /review #folder

# フォルダを名前でレビュー
@coding-rule-checker /review #folder:src/components
```

### ルールセットの上書き

```bash
# 特定のルールセットを使用（自動検出を上書き）
@coding-rule-checker /review --ruleset=typescript-rules #file

# 複数のルールセットを使用
@coding-rule-checker /review -r typescript-rules,security-rules #file
```

### Git Diff レビュー

```bash
# ブランチ間のdiffをレビュー
@coding-rule-checker /diff main..feature

# 特定のファイルのdiffをレビュー
@coding-rule-checker /diff main..feature #file

# コミットされていない変更をレビュー
@coding-rule-checker /diff
```

### GitHub連携

```bash
# 単一のGitHubファイルをレビュー
@coding-rule-checker /review https://github.com/owner/repo/blob/main/src/app.ts

# 複数のGitHubファイルをレビュー
@coding-rule-checker /review https://github.com/.../file1.ts https://github.com/.../file2.ts

# GitHubのdiffをレビュー
@coding-rule-checker /diff https://github.com/owner/repo/compare/main...feature
```

### 高度な使用法

```bash
# パスベースのレビュー（絶対パスまたは拡張子付きの相対パス）
@coding-rule-checker /review ./src/app.ts ../utils/helper.ts

# ルールセットの上書きとフォルダレビューの組み合わせ
@coding-rule-checker /review --ruleset=java-rules #folder:src/main/java
```

## コマンドリファレンス

### `/review` - コードのレビュー

コーディングルールに対してファイル全体またはフォルダ全体をレビューします。

**構文:**
```
/review [--ruleset=<rulesets>] <target>
/review [-r <rulesets>] <target>
```

**ターゲット:**
- `#file` - VSCodeファイル参照（UIで選択）
- `#file:filename` - ファイル名パターンによるファイル
- `#folder` - VSCodeフォルダ参照（UIで選択）
- `#folder:foldername` - フォルダ名パターンによるフォルダ
- `https://github.com/...` - GitHubファイルURL
- `./path/to/file.ts` - 明示的なパス（拡張子付き）

**オプション:**
- `--ruleset=name` or `-r name` - ルールセットを上書き（複数指定の場合はカンマ区切り）

### `/diff` - Diffのレビュー

git diffの変更されたコードのみをレビューします。

**構文:**
```
/diff [range] [#file]
```

**例:**
- `/diff` - コミットされていない変更をレビュー
- `/diff main..feature` - ブランチ間のdiffをレビュー
- `/diff v1.0.0..v2.0.0` - タグ間のdiffをレビュー
- `/diff main..feature #file` - 特定のファイルのdiffをレビュー

## ドキュメント

- [spec.md](spec.md) - 詳細仕様書（日本語）
- [extension/README.md](extension/README.md) - 拡張機能のドキュメント
- [CLAUDE.md](CLAUDE.md) - Claude Code向け開発ガイド

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

1. **設定マネージャー** (`config.ts`): 設定とルール構成をロードします
2. **ルールパーサー** (`ruleParser.ts`): Markdownルールファイルを構造化データに解析します
3. **コードリトリーバー** (`codeRetriever.ts`): ローカルファイル、git、またはGitHubからコードを取得します
4. **レビューエンジン** (`reviewEngine.ts`): Copilot言語モデルを使用してレビューを実行します
5. **並列レビュアー** (`parallelReviewer.ts`): 並列レビュー処理を管理します
6. **出力フォーマッター** (`outputFormatter.ts`): クリック可能なリンク付きでレビュー結果をフォーマットし、保存します
7. **ロガー** (`logger.ts`): デバッグおよび診断ロギングを提供します

### 主要な設計パターン

- **並列実行**: 速度向上のため、レビューは章ごとに並列で実行されます
- **複数回の反復**: 各章はN回レビューされ、投票ベースで集約されます
- **偽陽性フィルタリング**: 自動検証チェックにより、誤った検出を減らします
- **柔軟な入力**: VSCode参照、ファイルパターン、GitHub URL、明示的なパスをサポート
- **ルールセットの上書き**: `--ruleset`フラグによる手動でのルールセット選択が自動検出をバイパスします

## 要件

- VSCode 1.85.0 以上
- GitHub Copilot サブスクリプション
- Node.js 20+ (開発用)
- `gh` CLI (GitHub連携用)

## コントリビューション

コントリビューションを歓迎します！Issueやプルリクエストを気軽にサブミットしてください。

## ライセンス

MIT

## 著者

spec.mdの仕様書に基づいて開発されました
