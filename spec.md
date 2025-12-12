# Overview
プロジェクトの仕様や要件を記述するためのドキュメントです。ここでは、システムの機能、性能、設計に関する詳細な情報を提供します。

## Project Name
Codign Rule Checker

## Description
Codign Rule Checkerは、マークダウン形式で記述されたコーディング規約に基づいて、コードの静的解析を行うツールです。VSCodeの拡張機能として動作し、Copilotチャットからの指示に基づいてコードを解析します。

## Features
- マークダウンで記述したコーディング規約を元に、コードの静的解析を行う
- VSCode拡張機能として動作し、Copilotチャットからの指示に基づいてコードを解析
- TypeScriptで実装されており、拡張性と保守性に優れる
- レビュー対象
    - ローカルの指定ファイル
    - ローカルのGitリポジトリの差分
    - GitHubリポジトリ上の指定ファイル
    - GitHubリポジトリ上の差分
- 対象がローカルかGitHubかは、ファイル指定の形式で自動判定
    - GitHubの場合、@codinf-rule-checker /reviewDiff https://github.com/xxxx のようにURLを指定
- GitHubリポジトリからのコード取得は、gh CLIを使用
- Copilotチャットに@codinf-rule-checkerと指示を送ることで、解析を開始
    - @codinf-rule-checker /reviewALL #file で指定ファイルの全コードを解析
    - @codinf-rule-checker /reviewDiff main..future #file で差分コードのみ解析。ファイル指定がなければすべてのファイルの差分を解析
        - 差分範囲は、Gitの差分指定形式に準拠
        - 差分指定がない場合は、ローカルの未コミット分の差分を解析
        - GitHubの場合、commit、pull request、branch名での差分指定が可能
- ファイル指定は、ローカルパスまたはGitHubリポジトリのURLで指定可能
- 差分取得は、行番号付きで取得し、レビューは+形式の差分コードに対してのみ実行する
- レビュー結果はチャットに返信され、マークダウンとしても出力する
- 複数のルールセットに対応し、ファイル拡張子に応じて適用するルールを切り替え可能
    - 1つの拡張子に対して複数のルールセットを適用可能
- レビューはCopilotのLanguage Modelを使用して実行
    - 使用するモデルは設定で変更可能
- レビューは並列化されて非同期で実行される。進行状況はチャットに通知
- レビューは章単位で分割し独立したコンテキストで実行
- レビューは複数回実行し、それぞれが独立したコンテキストで実行される
    - 複数回実行することでレビューの精度を向上させる
    - レビュー結果は正確にサマリーする為、最終出力までは内部的にJson形式で管理
    - それぞれのレビューは並列化されて非同期で実行されることにより、全体の処理時間を短縮
    - 複数回実行したレビュー結果は統合され、最終的なフィードバックとして提供される
    - レビューの回数は、全体のデフォルト値と章ごとの個別設定が可能
- レビュー後、誤検知がされていないかのチェックを複数回、独立したコンテキストで実行
    - 誤検知チェックも並列化されて非同期で実行される
    - 誤検知チェックの結果は最終フィードバックに統合される
    - 誤検知チェックの回数は設定で変更可能
- 各種設定は、json形式の設定ファイルでユーザーがカスタマイズ可能
- レビュー結果はチャットへの返信に加え、ファイルとしても出力可能
    - 出力先ディレクトリやファイル名のフォーマットは設定で変更可能
- レビュー用のプロンプトテンプレートはマークダウン形式で記述可能
    - システムプロンプト、レビュー用プロンプト、誤検知チェック用プロンプト、要約用プロンプトの4種類を用意
    - 各プロンプトテンプレートはユーザーがカスタマイズ可能
- ルールセットごとに個別の設定ファイルを用意
    - ルールファイルの格納ディレクトリのパス
    - レビュー結果のファイル出力設定
    - レビューの実行回数設定
    - 誤検知チェックの実行回数設定

## directory structure
```
.
├── .vscode
│  └── coding-rule-checker
│       ├── settings.json
│       ├── system-prompt.md
│       ├── review-prompt.md
│       ├── false-positive-prompt.md
│       ├── summary-prompt.md
│       ├── rule1
│       │    ├── rule-settings.json
│       │    ├── review-results-templates.md
│       │    └── rules
│       │         ├── 01_example.md
│       │         └── 02_example.md
│       └── rule2
│            ├── rule-settings.json
│            ├── review-results-templates.md
│            └── rules
│                 ├── 01_example.md
│                 └── 02_example.md
├── extension
│   ├── README.md
│   ├── src
│   │   └── others...
│   ├── dist
│   │   └── others...
│   └── others...
└── README.md
```

## Configuration Files

### settings.json
拡張機能全体の設定を行うファイルです。
- model: 使用するLanguage Modelの指定
- systemPromptPath: システムプロンプトのテンプレートファイルのパス
- summaryPromptPath: レビュー結果の要約プロンプトのテンプレートファイルのパス
- rulesets: ファイル拡張子ごとに適用するルールセット

``` json
{
    "model": "GPT-5 mini",
    "systemPromptPath": ".vscode/coding-rule-checker/system-prompt.md",
    "summaryPromptPath": ".vscode/coding-rule-checker/summary-prompt.md",
    "rulesets": {
        ".js": ["rule1", "rule2"],
        ".py": ["rule2"]
    }
}
```

### system-prompt.md
システムプロンプトのテンプレートを記述するファイルです。

### review-prompt.md
コードレビュー用プロンプトのテンプレートを記述するファイルです。

### false-positive-prompt.md
誤検知チェック用プロンプトのテンプレートを記述するファイル

### summary-prompt.md
レビュー結果の要約プロンプトのテンプレートを記述するファイルです

### review-results-templates.md
レビュー結果のフォーマットテンプレートを記述するファイルです。

### rule-settings.json
各ルールセットごとの設定を行うファイルです。
- rulesPath: ルールファイルが格納されているディレクトリのパス
- レビュー結果出力の設定
    - fileOutput: ファイル出力の有無
    - outputDir: 出力先ディレクトリのパス
    - outputFileName: 出力ファイル名のフォーマット
        - `reviewed_{originalFileName}.md` のように、元のファイル名を埋め込むことが可能
- reviewIterations: レビューの実行回数の設定
    - default: デフォルトのレビュー回数
    - chapter: 章ごとの個別設定
- falsePositiveCheckIterations: 誤検知チェックの実行回数

``` json
{
    "rulesPath": ".vscode/coding-rule-checker/rule1/rules",
    "templatesPath": ".vscode/coding-rule-checker/rule1/review-results-templates.md",
    "fileOutput": {
        "enabled": true,
        "outputDir": ".vscode/coding-rule-checker/review-results",
        "outputFileName": "reviewed_{originalFileName}.md"
    }
    "reviewIterations": {
        "default": 3,
        "chapter": {
            01: 5,
            02: 4
        }
    },
    "falsePositiveCheckIterations": {
        "default": 2,
        "chapter": {
            01: 3
        }
    }
}
```

## Review Rules Format
ルールファイルはマークダウン形式で記述され、以下のようなフォーマットで構成されます。

``` markdown
## 1. Rule Chapter Title

### 1.1 Rule Title
Description of the rule.

### 1.2 Rule Title
Description of the rule.

#### 1.2.1 Sub Rule Title
Description of the sub-rule.
```

## Review Results Format
レビュー結果は以下のようなフォーマットで出力されます。
`review-results-templates.md`でテンプレートをカスタマイズも可能です。

``` markdown
# Review Sheet

## Review File
[{fileName}]({filePath})

## Diff Details
main...feature

## Review Results

### 1.1 Rule Title
- NG1 : {行番号}
    - NGコードスニペット:
        ```markdown
        {ngCodeSnippet}
        ```
    - NG理由:
        {ngReason}
    - 修正案:
        {suggestion}
- NG2 : {行番号}
    - NGコードスニペット:
        ```markdown
        {ngCodeSnippet}
        ```
    - NG理由:
        {ngReason}
    - 修正案:
        {suggestion}

### 1.2 Rule Title
- NG1 : {行番号}
    - NGコードスニペット:
        ```markdown
        {ngCodeSnippet}
        ```
    - NG理由:
        {ngReason}
    - 修正案:
        {suggestion}

## Review Summary
- NG数: {totalIssues}
- 主な指摘: {reviewedChapters}
```
