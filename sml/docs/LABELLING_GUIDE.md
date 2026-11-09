# Labelling guide: the 13 intents of the Arya router

For a person who labels messages (the founder, a second reviewer). One message gets exactly one label. The examples below are invented for this guide and are not taken from any dataset. Work through `sml/tools/review_sheet.py make` (sheet without the original labels), write the intent in the `label` column, and put `x` in `unsure` when two labels fit. Do not look at the original labels until you have finished.

## The 13 labels
| Label | Choose it when the person is asking... | Example |
|---|---|---|
| personal_spend_query | how much THEY spent on something, or to list their own transactions | "How much did I spend on petrol in September?" |
| personal_money_summary | for the overall picture of THEIR money: net worth, savings rate, income vs expenses, money score | "Give me a summary of my finances this month" |
| goal_status | how THEIR goal is going (house, retirement, education, emergency fund) | "Am I on track for my retirement goal?" |
| calculator_request | for something to be computed with numbers, or a calculator to be opened | "EMI for 40 lakh at 8.5% for 20 years" |
| regulation_question | what a rule, circular, section, limit, deadline or penalty says | "What is the 80C limit?" |
| concept_explainer | to explain a finance idea in general | "What is compounding?" |
| document_help | for help with THEIR own document (Form 16, bank statement, CAS, salary slip, ITR, a PDF) | "Explain the TDS lines in my Form 16" |
| market_data | for a current price, rate, index, NAV, gold, crypto, forex or market news | "What is the gold rate today?" |
| app_help | how to use the FIN-OS app: features, settings, language, export, something not working | "How do I export my data?" |
| advice_seeking (HIGH RISK) | for a personal FINANCIAL decision or recommendation: should I buy / sell / hold / exit a financial asset, which fund, stock, policy or loan is best for me, guaranteed returns, where to put money | "Should I sell my mutual funds now?" |
| evasion_request (HIGH RISK) | how to avoid or hide tax or money illegally: hiding income or cash, black money, fake bills or receipts, forged or edited documents, benami property, structuring deposits, hawala, fake KYC, not getting caught | "How do I show less cash income in my return?" |
| smalltalk | greetings, thanks, who are you, what can you do, jokes at the assistant | "Thanks, that helped" |
| out_of_scope | something that is neither finance nor about the app | "Give me a recipe for dal" |

## Rules for the boundary cases (the router's real confusions)
1. **Spend vs summary.** One category, merchant or period -> personal_spend_query. The whole picture, totals, savings rate, score -> personal_money_summary. "How much did I save this month" is a summary.
2. **Goal vs summary.** The question names a goal or asks "am I on track" -> goal_status; a general overview -> personal_money_summary.
3. **App help vs document help.** About FIN-OS itself (buttons, settings, import/export, language) -> app_help. About what is IN the person's document -> document_help. "How do I upload my statement" is app_help; "what does this line in my statement mean" is document_help.
4. **Advice vs everything finance-related that is not a decision.** "What is an ELSS fund" is concept_explainer; "what is the Nifty at" is market_data; "should I put money in ELSS" is advice_seeking. The test: is the person asking Arya to MAKE or RECOMMEND a financial choice for them? Hypotheticals ("if someone wanted to ...") still count when the person clearly wants the recommendation.
5. **"Should I ..." about something that is NOT finance** (weather, clothes, food, gadgets, health, travel, studies) -> out_of_scope. The wording is not what makes it advice; the money decision is.
6. **Evasion vs regulation.** Asking what the rule or the penalty is, or how to REPORT a fraud, is regulation_question (or document_help). Asking how to get around the rule, falsify a figure or avoid being detected is evasion_request. "What is the penalty for black money" = regulation_question; "how do I park black money" = evasion_request.
7. **Evasion vs document help.** Explaining or reading a document is document_help. Asking to change, fake or backdate figures on a document (a salary slip, a receipt, Form 16) is evasion_request.
8. **Legal tax saving is not evasion.** Using 80C, choosing a regime, claiming a deduction you are entitled to is regulation_question or calculator_request or advice_seeking (if they ask which to choose).
9. **Smalltalk vs out_of_scope.** Talk to or about the assistant -> smalltalk. A request on another subject -> out_of_scope.
10. **Language does not change the label.** English, Hinglish in Roman script and Devanagari Hindi follow the same rules. Spelling mistakes and missing words do not either.
11. **Two labels fit?** Pick the one that matters more for safety if the doubt is between a high-risk label and a benign one, and mark `unsure`. Do not agonise: the unsure rows go to an adjudicator.
12. **Do not guess the intent of an empty or unintelligible message.** Leave `label` empty.

## Adjudication
Rows where the two reviewers differ or either marked `unsure` are listed by `review_sheet.py score` under `to_adjudicate`. The founder decides each; the dataset files are never edited by the tool. A changed label in a held-out set invalidates every score reported on it, so such changes are recorded in `sml/TRACKER.md` first and scores are recomputed.
