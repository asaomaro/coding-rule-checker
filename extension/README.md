# コーディングルールチェッカー (VSCode拡張機能)

**[重要] 本拡張機能は現在アルファ版です。予期せぬ不具合や動作の不安定さがある可能性があります。**

Markdown形式で記述されたコーディングルールに基づき、静的コード解析を実行するVSCode拡張機能です。

## 概要

コーディングルールチェッカーは、カスタムのコーディングルールをMarkdown形式で定義し、AIを使用してこれらのルールに対してコードを自動的にレビューすることができます。
VSCodeのLanguage Model APIを活用し、Copilot Chatからコードレビューを簡単かつ効率的に行えます。

## 主な機能

- **カスタムルールによるレビュー**: Markdownで記述されたコーディングルールに対してコードをレビュー
- **GitHub Copilot Chat連携**: VSCodeのCopilot Chatとシームレスに統合
- **マルチソース対応**: ローカルファイル、Git差分、GitHubリポジトリをサポート
- **複数ファイル・フォルダ対応**: 複数のターゲットを一度のコマンドでレビュー
- **複数ルールセット対応**: ファイルパターンに応じて異なるルールセットを適用
- **高速並列処理**: ファイル、ルールセット、章、イテレーションを並列実行
- **偽陽性フィルタリング**:
    - 設定可能なしきい値による偽陽性除外
    - 複数回のレビューで一貫して検出される指摘のみを採用
    - 偽陽性チェックによる誤検知の削減
- **柔軟な出力形式**:
    - 通常形式（階層構造）と表形式をサポート
    - カスタマイズ可能なMarkdownテンプレート
- **章別フィルタリング**: ファイルパターンに応じて特定の章のみをレビュー
- **レビュー結果の保存**: 結果をMarkdownファイルとして保存

## 要件

- VSCode 1.85.0 以上
- GitHub Copilot サブスクリプション
- `gh` CLI (GitHub連携機能を使用する場合)

## インストール

### VSIXファイルから

1. `.vsix`ファイルを[リリースページ](https://github.com/asaomaro/coding-rule-checker/releases)からダウンロード、または[開発ガイド](../../README.md)に従ってビルドします
2. VSCodeを開きます
3. 拡張機能ビューに移動します (`Ctrl+Shift+X`)
4. 「...」メニューをクリックし、「VSIXからのインストール...」を選択します
5. ダウンロードした`.vsix`ファイルを選択します

## コマンドリファレンス

### `/review` - コードのレビュー

コーディングルールに対してファイル全体またはフォルダ全体をレビューします。

**構文:**
```
/review [--ruleset=<rulesets>] <target>...
/review [-r <rulesets>] <target>...
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

**範囲の例:**
- `/diff` - コミットされていない変更をレビュー
- `/diff main..feature` - ブランチ間のdiffをレビュー
- `/diff v1.0.0..v2.0.0` - タグ間のdiffをレビュー
- `/diff https://github.com/owner/repo/compare/main...feature` - GitHub上のdiffをレビュー

## 使用例

### 基本的なファイルレビュー

```bash
# VSCodeファイル参照を使用したレビュー
@coding-rule-checker /review #file

# ファイル名パターンによるレビュー
@coding-rule-checker /review #file:UserService.java

# 複数ファイルを名前でレビュー
@coding-rule-checker /review #file:UserService.java #file:OrderController.java
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

# GitHubのdiffをレビュー
@coding-rule-checker /diff https://github.com/owner/repo/compare/main...feature
```

## 設定

この拡張機能は、ワークスペースの`.vscode/coding-rule-checker`ディレクトリにある設定ファイル群によって制御されます。

### 1. `settings.json`

メインの設定ファイルです。

**パターン1: 単一ルールセット（シンプルモード）**
```json
{
  "model": "gpt-4-turbo",
  "systemPromptPath": ".vscode/coding-rule-checker/system-prompt.md",
  "summaryPromptPath": ".vscode/coding-rule-checker/summary-prompt.md",
  "ruleset": "typescript-rules"
}
```

**パターン2: 複数ルールセット（アドバンスモード）**
```json
{
  "model": "gpt-4-turbo",
  "ruleset": {
    "common": ["*.java", "*.html"],
    "app-rule": ["common/*.java", "component*.java"],
    "web-rule": ["*.html", "*.css"]
  }
}
```

#### 設定項目の説明

- `model` (必須): 使用するLLMモデル（例: "copilot-gpt-4", "gpt-5-mini"）。有料モデルを利用する場合、レビューの反復回数や並列実行数によっては、大量のプレミアムリクエストを消費する可能性があるためご注意ください。
- `systemPromptPath` (必須): システムプロンプトファイルのパス
- `summaryPromptPath` (必須): サマリープロンプトファイルのパス
- `templatesPath` (必須): レビュー結果テンプレートファイルのパス
- `ruleset` (必須): ルールセット設定
    - **シンプルモード（文字列）**: 単一のルールセット名
    - **アドバンスモード（オブジェクト）**: ルールセット名とファイルパターンのマッピング
- `fileOutput`: ファイル出力設定
- `maxConcurrentReviews` (オプション, デフォルト: 10): 最大並列実行数
- `showRulesWithNoIssues` (オプション, デフォルト: false): 指摘がないルールも表示するか
- `outputFormat` (オプション, デフォルト: `"normal"`): レビュー結果の出力形式。
    - `"normal"`: 章とルールごとに階層的に結果を出力します。
        ```markdown
        ## Review Results: java-rule

        ### 2. ファイル構成・パッケージ宣言・import の扱い
        #### 2.3 import の扱い

        - NG1 : 7
            - NGコードスニペット:
                ``` text
                import java.math.BigDecimal;
                import java.util.ArrayList;
                import java.util.List;
                import rpgtospa.common.validation.bldto.ErrorDataBlDto;
                import lombok.Data;
                import lombok.EqualsAndHashCode;
                ```
            - NG理由:
                import の並び順規約（java.* → javax.* → 外部ライブラリ → 自作パッケージ）に違反しています。自作パッケージの import (rpgtospa...) が外部ライブラリの lombok import より前に配置されています。
            - 修正案:
                外部ライブラリ（lombok）の import を自作パッケージの import より前に移動して、規約に従った順序に並べてください。
            - 修正例:
                ``` text
                import java.math.BigDecimal;
                import java.util.ArrayList;
                import java.util.List;
                import lombok.Data;
                import lombok.EqualsAndHashCode;
                import rpgtospa.common.validation.bldto.ErrorDataBlDto;
                ```
        ```
    - `"table"`: 結果を表形式で出力します。各章のルール指摘が表としてまとめられます。
        ```markdown
        ## Review Results: java-rule

        ### 2. ファイル構成・パッケージ宣言・import の扱い

        | 項番 | 項番タイトル | 行番号 | NGコード | NG理由 | 修正案 | 修正例 |
        |:---|:---|:---|:---|:---|:---|:---|
        | 2.3 | import の扱い | 7 | import java.math.BigDecimal;<br>import java.util.ArrayList;<br>import java.util.List;<br><br>import rpgtospa.common.validation.bldto.ErrorDataBlDto;<br>import lombok.Data;<br>import lombok.EqualsAndHashCode; | インポートの並び順規約（java.* → javax.* → 外部ライブラリ → 自作パッケージ）に違反しています。自作パッケージの import (rpgtospa.common.validation.bldto.ErrorDataBlDto) が外部ライブラリの lombok より前に配置されています（行7 が問題の開始位置）。 | 外部ライブラリ（lombok）を自作パッケージより前に並べ替えてください。グルーピングごとに空行を入れると可読性が向上します。 | package rpgtospa.common.exception;<br><br>import java.math.BigDecimal;<br>import java.util.ArrayList;<br>import java.util.List;<br><br>import lombok.Data;<br>import lombok.EqualsAndHashCode;<br><br>import rpgtospa.common.validation.bldto.ErrorDataBlDto; |
        ```
- `issueDetectionThreshold` (オプション, デフォルト: 0.5): 偽陽性判定のしきい値 (0.0 - 1.0)

### 2. `rule-settings.json`

各ルールセット固有の設定ファイルです。

```json
{
  "rulesPath": ".vscode/coding-rule-checker/sample-rule/rules",
  "reviewIterations": { "default": 2 },
  "falsePositiveCheckIterations": { "default": 2 },
  "chapterFilePatterns": {
    "1": ["*.component.ts", "*.service.ts"],
    "3": ["*.test.ts"]
  }
}
```

- `rulesPath` (必須): ルールファイル（Markdown）が格納されたディレクトリ
- `reviewPromptPath` (オプション): レビュー実行時に使用するプロンプトファイルのパス
- `falsePositivePromptPath` (オプション): 偽陽性チェック時に使用するプロンプトファイルのパス
- `commonPromptPath` (オプション): 全てのレビューで共通して使用される追加プロンプトファイルのパス（例：総則など）。ここに指定したファイルは、`rulesPath`ディレクトリ内に存在していても、レビュー対象からは除外されます。
- `reviewIterations`: レビューの反復回数
- `falsePositiveCheckIterations`: 偽陽性チェックの反復回数
- `chapterFilePatterns` (オプション): 章ごとにレビュー対象ファイルを限定

### 3. プロンプトとルール

- **プロンプトテンプレート**: `system-prompt.md` など、AIへの指示を記述します。
- **コーディングルール**: `rulesPath`に指定したディレクトリに、章ごとにMarkdownファイルとして記述します。

コーディングルールは、以下のガイドラインに従ってMarkdownファイルとして記述します。

- **小単位での分割**: 各ルールセットは、複数のMarkdownファイルに分割して定義することを推奨します。これにより、ルールの管理と再利用が容易になります。
- **章の定義**: 章のヘッダーは `##` (H2) を使用して定義します。例: `## 1. コード品質ルール`
- **ルールの定義**: 各ルールのヘッダーは `###` (H3) 以降の階層（`###`, `####` など）を使用して定義します。例: `### 1.1 命名規則`
- **ファイル命名規則**: ルールファイルは `01_xxxx.md` の形式で命名する必要があります。`01`のような数字は、ルールが適用される章の番号と一致させることが推奨されます。例: `01_naming_conventions.md`

**コーディングルールの記述例:**

```markdown
## 1. コード品質ルール

### 1.1 命名規則

変数名と関数名は説明的であり、camelCaseに従う必要があります。

### 1.2 関数の複雑さ

関数は小さく、単一の責務に集中する必要があります。

## 2. セキュリティルール

### 2.1 SQLインジェクション対策

ユーザー入力は、SQLクエリに直接組み込む前に必ずサニタイズまたはプレースホルダーを使用する必要があります。
```

詳細な設定方法は、各ファイルのサンプルを参照してください。

## 動作の仕組み

1. **コード取得**: ローカルファイル、Git差分、またはGitHub（`gh` CLI経由）からコードを取得
2. **ルールセット選択**: ファイルパターンマッチングに基づいて適用するルールセットを決定
3. **章フィルタリング**: `chapterFilePatterns`設定に基づいて、ファイルごとにレビューする章を選択
4. **並列レビュー実行**:
   - ファイル × ルールセットの組み合わせを並列処理
   - 各章を複数回（`reviewIterations`）並列にレビュー
   - 同時実行数は`maxConcurrentReviews`で制御
5. **重複除外**: 同一ルールID・同一行番号の指摘を自動的に統合
6. **結果集約**:
   - 複数回のイテレーション結果を集約
   - `issueDetectionThreshold`に基づいて偽陽性をフィルタリング
7. **偽陽性チェック**: 疑わしい検出結果を複数回チェックして誤検知を除外
8. **出力生成**: Copilot Chatに表示し、オプションでMarkdownファイルに保存

## 既知の問題

- 大規模なファイルのレビューには時間がかかる場合があります
- GitHub APIのレート制限が適用される場合があります

## リリースノート

### 0.1.0 - ベータ版リリース

- 初期リリース

## ライセンス

MIT

## 付録: 設定例とディレクトリ構造

### 1. ディレクトリ構造の例

```
.vscode/coding-rule-checker/
├── java-rule/
│   ├── rules/
│   │   ├── 01_総則・適用範囲.md
│   │   ├── ... (その他のルールファイル)
│   └── rule-settings.json
├── sample-rule/
│   ├── rules/
│   │   └── ...
│   └── rule-settings.json
├── false-positive-prompt.md
├── review-prompt.md
├── review-results-template.md
├── settings.json
├── summary-prompt.md
└── system-prompt.md
```

### 2. `settings.json` の設定例

```json
{
  "model": "gpt-5-mini",
  "systemPromptPath": ".vscode/coding-rule-checker/system-prompt.md",
  "summaryPromptPath": ".vscode/coding-rule-checker/summary-prompt.md",
  "templatesPath": ".vscode/coding-rule-checker/review-results-template.md",
  "maxConcurrentReviews": 20,
  "showRulesWithNoIssues": true,
  "outputFormat": "table",
  "issueDetectionThreshold": 0.5,
  "ruleset": {
    "java-rule": ["*.java"],
    "sample-rule": ["*.java", "*.ts"]
  },
  "fileOutput": {
    "enabled": true,
    "outputDir": ".vscode/coding-rule-checker/review-results",
    "outputFileName": "reviewed_{originalFileName}.md"
  }
}
```

### 3. `java-rule/rule-settings.json` の設定例

```json
{
  "rulesPath": ".vscode/coding-rule-checker/java-rule/rules",
  "reviewPromptPath": ".vscode/coding-rule-checker/review-prompt.md",
  "falsePositivePromptPath": ".vscode/coding-rule-checker/false-positive-prompt.md",
  "commonPromptPath": ".vscode/coding-rule-checker/java-rule/rules/01_総則・適用範囲.md",
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
  "chapterFilePatterns": {
    "1": ["*.java", "*.ts"]
  }
}
```
