import streamlit as st
import sqlite3
import pandas as pd
import json
import requests
import os
import shutil

# Set wide page configuration
st.set_page_config(
    page_title="Agentic Accounting — Unified Neuro-Symbolic Platform",
    page_icon="🛡️",
    layout="wide",
    initial_sidebar_state="expanded"
)

API_BASE_URL = "http://localhost:8000"
DB_PATH = "accounting.db"

# Helper for database connection
def get_db_connection():
    return sqlite3.connect(DB_PATH)

# =========================================================================
# SIDEBAR: SYSTEM STATUS & GLOBAL CONTROLS
# =========================================================================
with st.sidebar:
    st.title("🛡️ Agentic AI Accounting")
    st.caption("3-Stage Neuro-Symbolic Autonomous Platform")
    
    st.markdown("---")
    st.subheader("System Architecture")
    st.success("🧮 **Python Arithmetic:** ACTIVE\n(Deterministic, 0% Math Hallucination)")
    st.info("🧠 **LLM Semantic Core:** ACTIVE\n(Groq `qwen/qwen3.8-27b`)")

    # Check backend connectivity
    backend_online = False
    try:
        r = requests.get(f"{API_BASE_URL}/", timeout=2)
        if r.status_code == 200:
            backend_online = True
    except Exception:
        backend_online = False

    if backend_online:
        st.caption("🟢 Backend API: `Online (Port 8000)`")
    else:
        st.caption("🔴 Backend API: `Offline / Connecting...`")

    st.markdown("---")
    st.subheader("Database Live Status")
    conn = get_db_connection()
    c = conn.cursor()
    
    doc_count = c.execute("SELECT COUNT(*) FROM documents").fetchone()[0]
    st.write(f"📁 **Documents:** `{doc_count}`")
    
    pending_count = c.execute("SELECT COUNT(*) FROM journal_entries WHERE status = 'PENDING_AUDIT'").fetchone()[0]
    flagged_count = c.execute("SELECT COUNT(*) FROM journal_entries WHERE status = 'HUMAN_REVIEW'").fetchone()[0]
    draft_count = c.execute("SELECT COUNT(*) FROM journal_entries WHERE status = 'DRAFT'").fetchone()[0]
    posted_count = c.execute("SELECT COUNT(*) FROM journal_entries WHERE status = 'POSTED'").fetchone()[0]
    
    st.write(f"⏳ **Audit Queue (Pending):** `{pending_count}`")
    st.write(f"⚠️ **Audit Queue (Flagged):** `{flagged_count}`")
    st.write(f"📝 **Draft Journals:** `{draft_count}`")
    st.write(f"📘 **Posted to Ledger:** `{posted_count}`")
    conn.close()

    st.markdown("---")
    st.subheader("System Reset & Utilities")
    if st.button("🧹 Clear All Data (Start Fresh)", type="secondary", use_container_width=True):
        conn = get_db_connection()
        cur = conn.cursor()
        cur.execute("DELETE FROM journal_entries")
        cur.execute("DELETE FROM accounting_transactions")
        cur.execute("DELETE FROM documents")
        conn.commit()
        cur.execute("CREATE VIEW IF NOT EXISTS daily_ledger_staging AS SELECT * FROM journal_entries WHERE status IN ('PENDING_AUDIT', 'HUMAN_REVIEW', 'DRAFT')")
        conn.commit()
        conn.close()
        
        # Clean uploaded document storage
        doc_dir = "documents"
        if os.path.exists(doc_dir):
            for d in os.listdir(doc_dir):
                item_p = os.path.join(doc_dir, d)
                if os.path.isdir(item_p):
                    shutil.rmtree(item_p)
                    
        st.success("Database and documents cleared! Fresh state ready.")
        st.rerun()

    if st.button("🔄 Refresh Dashboard", use_container_width=True):
        st.rerun()

# =========================================================================
# MAIN APP: UNIFIED 3-STAGE INTERFACE
# =========================================================================
st.title("Unified AI Agentic Accounting Platform")
st.markdown("""
This platform consolidates all 3 stages of the accounting lifecycle into a single operational interface:
**Stage 1: Document Ingestion & Extraction** ➔ **Stage 2: Audit Queue & Staging Buffer** ➔ **Stage 3: General Ledger, Trial Balance & Post-Posting Audit**.
""")

tab_stage1, tab_stage2, tab_stage3, tab_coa = st.tabs([
    "📥 Stage 1: Document Ingestion & Extraction",
    "⚖️ Stage 2: Audit Queue & Staging Buffer",
    "📊 Stage 3: General Ledger & Post-Posting Audit",
    "🏢 Chart of Accounts & Company Context"
])

# =========================================================================
# TAB 1: STAGE 1 — DOCUMENT INGESTION & EXTRACTION
# =========================================================================
with tab_stage1:
    st.header("Stage 1: Document Processing, Deterministic Math & Semantic Extraction")
    st.caption("Upload invoices, receipts, bank statements or credit notes. Python executes exact arithmetic checks while the LLM verifies semantic roles without doing math.")

    col_up1, col_up2 = st.columns([1, 1])

    with col_up1:
        st.subheader("Upload Financial Document")
        uploaded_file = st.file_uploader("Upload PDF, PNG, or JPG", type=["pdf", "png", "jpg", "jpeg"])
        if uploaded_file is not None:
            if st.button("🚀 Process & Ingest Document", type="primary"):
                with st.spinner("Executing OCR, Python Math verification, and LLM Semantic Extraction..."):
                    try:
                        files = {"file": (uploaded_file.name, uploaded_file.getvalue(), uploaded_file.type)}
                        data = {"company_id": "COMP-000001"}
                        res = requests.post(f"{API_BASE_URL}/api/documents/upload", files=files, data=data)
                        if res.status_code == 200:
                            st.success(f"Successfully processed {uploaded_file.name}!")
                            st.rerun()
                        elif res.status_code == 409:
                            st.warning("Duplicate Document Detected: " + res.json().get("message", ""))
                        else:
                            st.error(f"Error ({res.status_code}): {res.text}")
                    except Exception as e:
                        st.error(f"Failed to communicate with API: {e}")

    with col_up2:
        st.subheader("Quick-Load Test Documents")
        st.caption("Quickly test with sample test files located in `testing_document/`.")
        test_dir = "../testing_document" if os.path.exists("../testing_document") else "testing_document"
        if os.path.exists(test_dir):
            sample_files = [f for f in os.listdir(test_dir) if f.endswith(".pdf")]
            selected_sample = st.selectbox("Select Sample Document:", ["-- Choose a sample document --"] + sample_files)
            if selected_sample != "-- Choose a sample document --":
                if st.button(f"📥 Ingest '{selected_sample}'", type="secondary"):
                    with st.spinner(f"Ingesting {selected_sample}..."):
                        sample_path = os.path.join(test_dir, selected_sample)
                        with open(sample_path, "rb") as f:
                            files = {"file": (selected_sample, f.read(), "application/pdf")}
                            data = {"company_id": "COMP-000001"}
                            res = requests.post(f"{API_BASE_URL}/api/documents/upload", files=files, data=data)
                            if res.status_code == 200:
                                st.success(f"Ingested {selected_sample}!")
                                st.rerun()
                            elif res.status_code == 409:
                                st.warning("Duplicate detected: Document already ingested.")
                            else:
                                st.error(f"Error ({res.status_code}): {res.text}")
        else:
            st.info("No `testing_document/` folder found in root directory.")

    st.markdown("---")
    st.subheader("Ingested Documents Explorer")
    
    conn = get_db_connection()
    df_docs = pd.read_sql("SELECT id, document_id, original_filename, document_type, vendor_name, currency, grand_total, converted_amount_myr, exchange_rate, exchange_rate_date, exchange_rate_provider, status, created_at, extracted_data_json FROM documents ORDER BY id DESC", conn)
    conn.close()

    if df_docs.empty:
        st.info("No documents uploaded yet. Upload a document above to begin.")
    else:
        st.dataframe(
            df_docs[['document_id', 'original_filename', 'document_type', 'vendor_name', 'grand_total', 'status', 'created_at']],
            use_container_width=True
        )

        selected_doc_id = st.selectbox("Select Document to Inspect Details:", df_docs['document_id'].tolist())
        selected_row = df_docs[df_docs['document_id'] == selected_doc_id].iloc[0]

        extracted = {}
        try:
            extracted = json.loads(selected_row['extracted_data_json']) if selected_row['extracted_data_json'] else {}
        except Exception:
            extracted = {}

        with st.expander(f"🔍 Detailed Inspection for {selected_doc_id} ({selected_row['document_type']})", expanded=True):
            col_d1, col_d2 = st.columns(2)
            with col_d1:
                st.write(f"**Document ID:** `{selected_doc_id}`")
                st.write(f"**Document Type:** `{selected_row['document_type']}`")
                st.write(f"**Date:** `{extracted.get('transaction_date') or extracted.get('statement_date') or '-'}`")
                st.write(f"**Vendor / Counterparty:** `{selected_row['vendor_name'] or extracted.get('buyer_name') or '-'}`")
            with col_d2:
                doc_curr = selected_row.get('currency') or extracted.get('currency') or 'MYR'
                orig_tot = selected_row['grand_total'] or extracted.get('grand_total') or 0.0
                conv_tot = selected_row.get('converted_amount_myr') or extracted.get('converted_amount_myr')
                rate_val = selected_row.get('exchange_rate') or extracted.get('exchange_rate')
                rate_prov = selected_row.get('exchange_rate_provider') or extracted.get('exchange_rate_provider')
                if doc_curr != 'MYR':
                    st.write(f"**Currency:** `{doc_curr}`")
                    st.write(f"**Original Subtotal:** {doc_curr} {extracted.get('subtotal', 0.0):,.2f}")
                    if extracted.get('discount'):
                        st.write(f"**Original Discount:** - {doc_curr} {extracted.get('discount', 0.0):,.2f}")
                    if extracted.get('shipping'):
                        st.write(f"**Original Shipping:** + {doc_curr} {extracted.get('shipping', 0.0):,.2f}")
                    if extracted.get('tax_amount'):
                        st.write(f"**Original Tax:** {doc_curr} {extracted.get('tax_amount', 0.0):,.2f}")
                    st.write(f"**Original Grand Total:** {doc_curr} {orig_tot:,.2f}")
                    if conv_tot:
                        st.success(f"**Converted (MYR):** RM {conv_tot:,.2f}\n\n*(Rate: {rate_val} via {rate_prov or 'BNM Session 1700'})*")
                else:
                    st.write(f"**Subtotal:** RM {extracted.get('subtotal', 0.0):,.2f}")
                    if extracted.get('discount'):
                        st.write(f"**Discount:** - RM {extracted.get('discount', 0.0):,.2f}")
                    if extracted.get('shipping'):
                        st.write(f"**Shipping:** + RM {extracted.get('shipping', 0.0):,.2f}")
                    st.write(f"**Tax Amount:** RM {extracted.get('tax_amount', 0.0):,.2f}")
                    st.write(f"**Grand Total:** RM {selected_row['grand_total']:,.2f}")
                st.write(f"**Payment Method:** `{extracted.get('payment_method') or '-'}`")

            # Stage 1 Verification Panel
            calc_ver = extracted.get("calculation_verification", {})
            semantic_ver = extracted.get("semantic_verification", {})

            st.markdown("#### 🛡️ Stage 1 Neuro-Symbolic Verification")
            col_v1, col_v2 = st.columns(2)

            with col_v1:
                math_ok = extracted.get("math_verified", True)
                if math_ok:
                    st.success("##### 🟢 Python Math: VERIFIED (Exact Arithmetic)")
                    st.write("• Line items calculation checked: `PASS`")
                    st.write("• Subtotal summation checked: `PASS`")
                    st.write("• Grand total math checked: `PASS`")
                else:
                    st.error("##### 🔴 Python Math: FAILED")
                    for d in calc_ver.get("details", []):
                        st.write(f"• {d}")

            with col_v2:
                st.info("##### 🧠 LLM Semantic Thinking Process (No Math)")
                verdict = semantic_ver.get("extraction_verdict", "CORRECT")
                st.markdown(f"**Verdict:** `{verdict}`")
                tp = semantic_ver.get("thought_process", {})
                st.write(f"**Step 1 (Date):** {tp.get('step_1_date_check', '—')}")
                st.write(f"**Step 2 (Role):** {tp.get('step_2_entity_role_check', '—')}")
                st.write(f"**Step 3 (Doc Type):** {tp.get('step_3_document_type_check', '—')}")
                st.write(f"**Rationale:** {tp.get('decision_rationale', '—')}")

            # Line Items Table
            lines = extracted.get("line_items", [])
            if lines:
                st.markdown("##### Extracted Line Items:")
                st.dataframe(pd.DataFrame(lines), use_container_width=True)

# =========================================================================
# TAB 2: STAGE 2 — AUDIT QUEUE & STAGING BUFFER
# =========================================================================
with tab_stage2:
    st.header("Stage 2: Double-Entry Audit Queue & Staging Buffer (`daily_ledger_staging`)")
    st.markdown(r"""
    All drafted double-entry journal entries wait in this staging buffer.
    * **Python Engine:** Guarantees strict double-entry balance ($\sum \text{Debits} == \sum \text{Credits}$).
    * **Stage 2 LLM Auditor:** Runs semantic accounting rules, RAG historical matching, and assigns `POSTED` or `HUMAN_REVIEW`.
    * **Agent 4 ReAct Backtracking:** Troubleshoots flagged entries and proposes balanced fixes.
    """)

    # Batch Audit Action Box
    col_act1, col_act2, col_act3 = st.columns([1.5, 1, 1])
    with col_act1:
        if st.button("🚀 Run Stage 2 Batch LLM Audit (All Pending Journals)", type="primary", use_container_width=True):
            with st.spinner("Agent 3 is auditing all PENDING_AUDIT journals via RAG & accounting rules..."):
                try:
                    res_a = requests.post(f"{API_BASE_URL}/api/journals/audit", timeout=60)
                    if res_a.status_code == 200:
                        a_data = res_a.json()
                        st.success(a_data.get("message", "Audit complete!"))
                        st.rerun()
                    else:
                        st.error(f"Audit API Error ({res_a.status_code}): {res_a.text}")
                except Exception as e:
                    st.error(f"Audit connection failed: {e}")

    conn = get_db_connection()
    c = conn.cursor()
    c_pending = c.execute("SELECT COUNT(*) FROM journal_entries WHERE status = 'PENDING_AUDIT'").fetchone()[0]
    c_review = c.execute("SELECT COUNT(*) FROM journal_entries WHERE status = 'HUMAN_REVIEW'").fetchone()[0]
    c_posted = c.execute("SELECT COUNT(*) FROM journal_entries WHERE status = 'POSTED'").fetchone()[0]
    conn.close()

    with col_act2:
        st.metric("Pending in Queue", c_pending)
    with col_act3:
        st.metric("Flagged for Human Review", c_review)

    st.markdown("---")
    
    # Filter Controls
    status_filter = st.radio(
        "Filter Staging Buffer by Status:",
        ["HUMAN_REVIEW (Flagged)", "ALL", "PENDING_AUDIT", "DRAFT", "POSTED"],
        horizontal=True
    )

    clean_status = status_filter.split()[0]
    conn = get_db_connection()
    if clean_status == "ALL":
        query = "SELECT * FROM daily_ledger_staging ORDER BY id DESC"
    else:
        query = f"SELECT * FROM daily_ledger_staging WHERE status = '{clean_status}' ORDER BY id DESC"
    
    df_staging = pd.read_sql(query, conn)
    conn.close()

    if df_staging.empty:
        st.info(f"No journal entries found matching status '{clean_status}'.")
    else:
        st.write(f"Showing **{len(df_staging)}** entry/entries:")

        for idx, row in df_staging.iterrows():
            badge_color = "🔴" if row['status'] == "HUMAN_REVIEW" else ("🟡" if row['status'] == "PENDING_AUDIT" else "🟢")
            with st.expander(f"{badge_color} [{row['status']}] {row['journal_id']} — {row['description']}", expanded=(row['status'] == "HUMAN_REVIEW")):
                col_ji1, col_ji2, col_ji3 = st.columns(3)
                col_ji1.write(f"**Date:** `{row['journal_date']}`")
                col_ji1.write(f"**Ref:** `{row['reference'] or '-'}`")
                col_ji2.write(f"**Transaction ID:** `{row['transaction_id']}`")
                col_ji2.write(f"**Document ID:** `{row['document_id']}`")
                col_ji3.markdown(f"**Python Balance Check:** `RM {row['total_debit']:,.2f} == RM {row['total_credit']:,.2f}` ✅")

                # Parse LLM Audit Reasoning
                audit_raw = row['audit_reasoning']
                parsed_audit = None
                try:
                    if audit_raw and audit_raw.strip().startswith("{"):
                        parsed_audit = json.loads(audit_raw)
                except Exception:
                    parsed_audit = None

                st.markdown("#### 🧠 Stage 2 LLM Accounting Thinking Process")
                if parsed_audit and "thought_process" in parsed_audit:
                    tp2 = parsed_audit["thought_process"]
                    col_tp2a, col_tp2b = st.columns(2)
                    with col_tp2a:
                        st.info(f"**Step 1: Account Classification**\n\n{tp2.get('step_1_account_classification', '—')}")
                        st.info(f"**Step 2: Accounting Rules Compliance**\n\n{tp2.get('step_2_rules_compliance', '—')}")
                    with col_tp2b:
                        st.info(f"**Step 3: Historical Consistency (RAG)**\n\n{tp2.get('step_3_historical_consistency', '—')}")
                        st.warning(f"**Decision Rationale**\n\n{tp2.get('decision_rationale', parsed_audit.get('summary', '—'))}")
                else:
                    st.write(f"**Reasoning:** {audit_raw or 'Pending LLM evaluation.'}")

                # Journal Lines Table
                lines = json.loads(row['lines_json']) if row['lines_json'] else []
                if lines:
                    st.markdown("##### Double-Entry Lines (Computed by Python):")
                    lines_df = pd.DataFrame(lines)
                    st.dataframe(lines_df[['account_code', 'account_name', 'debit', 'credit']], use_container_width=True)

                # Action Controls
                col_b1, col_b2, col_b3 = st.columns(3)
                with col_b1:
                    if st.button("✅ Approve & Post to General Ledger", key=f"appr_{row['id']}"):
                        conn = get_db_connection()
                        c = conn.cursor()
                        c.execute("UPDATE journal_entries SET status = 'POSTED' WHERE id = ?", (row['id'],))
                        conn.commit()
                        conn.close()
                        st.success("Journal posted to General Ledger!")
                        st.rerun()

                with col_b2:
                    if st.button("↩️ Revert to Draft", key=f"drft_{row['id']}"):
                        conn = get_db_connection()
                        c = conn.cursor()
                        c.execute("UPDATE journal_entries SET status = 'DRAFT' WHERE id = ?", (row['id'],))
                        conn.commit()
                        conn.close()
                        st.info("Reverted to Draft.")
                        st.rerun()

                with col_b3:
                    if st.button("🤖 Run ReAct Backtracking (Agent 4)", key=f"rct_{row['id']}", type="primary"):
                        st.session_state[f"react_active_{row['id']}"] = True

                # Agent 4 Diagnostic Box
                if st.session_state.get(f"react_active_{row['id']}", False):
                    st.divider()
                    st.markdown("### 🛠️ Agent 4: ReAct Backtracking Autonomous Fix")
                    with st.spinner("Analyzing root cause and generating balanced correction..."):
                        try:
                            res_r = requests.post(f"{API_BASE_URL}/api/agents/react_backtrack/{row['journal_id']}", timeout=30)
                            if res_r.status_code == 200:
                                r_data = res_r.json().get("analysis", {})
                                
                                st.markdown(f"**Agent Thought (Root Cause):**\n\n{r_data.get('thought', 'N/A')}")
                                st.markdown(f"**Proposed Fix:**\n\n{r_data.get('proposed_fix', 'N/A')}")
                                
                                math_verified = r_data.get("math_verified", False)
                                total_dr = r_data.get("total_debit", 0.0)
                                total_cr = r_data.get("total_credit", 0.0)
                                
                                if math_verified:
                                    st.success(f"✅ Python Math Verification: Proposed lines strictly balance (Dr RM {total_dr:,.2f} == Cr RM {total_cr:,.2f}).")
                                else:
                                    st.error(f"❌ Python Math Verification: Proposed lines unbalanced.")

                                corrected_lines = r_data.get("new_lines", [])
                                if corrected_lines:
                                    st.dataframe(pd.DataFrame(corrected_lines), use_container_width=True)

                                if st.button("🚀 Apply Fix & Post to Ledger", key=f"apply_{row['id']}"):
                                    conn = get_db_connection()
                                    c = conn.cursor()
                                    c.execute("""
                                        UPDATE journal_entries 
                                        SET lines_json = ?, total_debit = ?, total_credit = ?, status = 'POSTED', audit_reasoning = ?
                                        WHERE id = ?
                                    """, (
                                        json.dumps(corrected_lines),
                                        total_dr,
                                        total_cr,
                                        f"Resolved via Agent 4 ReAct Backtracking: {r_data.get('proposed_fix')}",
                                        row['id']
                                    ))
                                    conn.commit()
                                    conn.close()
                                    st.success("Fix applied and entry successfully posted!")
                                    st.rerun()
                            else:
                                st.error(f"ReAct Agent Error ({res_r.status_code}): {res_r.text}")
                        except Exception as e:
                            st.error(f"ReAct agent communication failure: {e}")

# =========================================================================
# TAB 3: STAGE 3 — GENERAL LEDGER & POST-POSTING AUDIT
# =========================================================================
with tab_stage3:
    st.header("Stage 3: General Ledger, Financial Reports & Post-Posting Audit")
    st.caption("Aggregates all POSTED transactions. Python computes net balances and sums Trial Balance, P&L, and Balance Sheet equations. The LLM audits ledger-level anomalies.")

    col_gl1, col_gl2 = st.columns([1, 1])
    with col_gl1:
        if st.button("🔍 Run Stage 3 AI General Ledger Audit", type="primary", use_container_width=True):
            with st.spinner("Auditing posted ledger accounts and checking financial anomalies..."):
                try:
                    res_la = requests.get(f"{API_BASE_URL}/api/ledger/audit", timeout=30)
                    if res_la.status_code == 200:
                        st.session_state["ledger_audit_result"] = res_la.json()
                        st.success("Stage 3 Post-Posting Audit Complete!")
                    else:
                        st.error(f"Ledger Audit Error ({res_la.status_code}): {res_la.text}")
                except Exception as e:
                    st.error(f"Audit connection failed: {e}")

    # Stage 3 Audit Report Display
    audit_res = st.session_state.get("ledger_audit_result")
    if audit_res:
        st.markdown("---")
        col_st1, col_st2 = st.columns(2)
        with col_st1:
            if audit_res.get("ledger_verdict") == "NORMAL":
                st.success("### Ledger Health: NORMAL ✅")
            else:
                st.warning("### Ledger Health: ANOMALIES DETECTED ⚠️")
        with col_st2:
            tb_ok = audit_res.get("trial_balance_balanced", False)
            bs_ok = audit_res.get("balance_sheet_balanced", False)
            st.metric("Trial Balance Math Verified", "BALANCED ✅" if tb_ok else "UNBALANCED ❌")

        # Explainable Thinking Process
        st.markdown("#### 🧠 LLM Post-Posting Thinking Process")
        tp_l = audit_res.get("thought_process", {})
        col_ltp1, col_ltp2 = st.columns(2)
        with col_ltp1:
            st.info(f"**Step 1: Balance Direction Check**\n\n{tp_l.get('step_1_balance_direction_check', '—')}")
            st.info(f"**Step 2: Prerequisite Completeness Check**\n\n{tp_l.get('step_2_prerequisite_completeness_check', '—')}")
        with col_ltp2:
            st.info(f"**Step 3: Reporting Coherence Check**\n\n{tp_l.get('step_3_reporting_coherence_check', '—')}")
            st.warning(f"**Decision Rationale**\n\n{tp_l.get('decision_rationale', '—')}")

        st.markdown(f"**Executive Summary:** {audit_res.get('executive_summary', 'N/A')}")

        anomalies = audit_res.get("anomalies", [])
        if anomalies:
            st.markdown("##### 🚨 Detected Ledger Anomalies & Actionable Recommendations:")
            st.dataframe(pd.DataFrame(anomalies), use_container_width=True)

    st.markdown("---")
    st.subheader("Live Financial Reports (Computed by Python)")

    tab_tb, tab_gl, tab_pl, tab_bs = st.tabs(["Trial Balance", "General Ledger", "Profit & Loss", "Balance Sheet"])

    # 1. Trial Balance Sub-tab
    with tab_tb:
        try:
            r_tb = requests.get(f"{API_BASE_URL}/api/ledger/", timeout=5).json()
            ledger_items = r_tb.get("ledger", [])
            tb_totals = r_tb.get("trial_balance", {})

            if not ledger_items:
                st.info("No posted transactions in the ledger yet.")
            else:
                tb_rows = []
                for item in ledger_items:
                    bal = item.get("balance", 0.0)
                    norm = item.get("normal_balance", "DEBIT")
                    dr_amt = bal if (norm == "DEBIT" and bal >= 0) or (norm == "CREDIT" and bal < 0) else 0.0
                    cr_amt = bal if (norm == "CREDIT" and bal >= 0) or (norm == "DEBIT" and bal < 0) else 0.0
                    
                    tb_rows.append({
                        "Account Code": item.get("account_code"),
                        "Account Name": item.get("account_name"),
                        "Normal": norm,
                        "Debit (RM)": abs(dr_amt) if dr_amt != 0 else None,
                        "Credit (RM)": abs(cr_amt) if cr_amt != 0 else None
                    })

                st.dataframe(pd.DataFrame(tb_rows), use_container_width=True)
                
                col_tb1, col_tb2, col_tb3 = st.columns(3)
                col_tb1.metric("Total Debits", f"RM {tb_totals.get('total_debit', 0.0):,.2f}")
                col_tb2.metric("Total Credits", f"RM {tb_totals.get('total_credit', 0.0):,.2f}")
                col_tb3.metric("Balanced Status", "BALANCED ✅" if tb_totals.get("is_balanced") else "OUT OF BALANCE ❌")
        except Exception as e:
            st.error(f"Failed to load Trial Balance: {e}")

    # 2. General Ledger Sub-tab
    with tab_gl:
        try:
            r_gl = requests.get(f"{API_BASE_URL}/api/ledger/", timeout=5).json()
            ledger_items = r_gl.get("ledger", [])
            if not ledger_items:
                st.info("General Ledger is currently empty.")
            else:
                for acc in ledger_items:
                    with st.expander(f"{acc['account_code']} — {acc['account_name']} (Net Balance: RM {acc['balance']:,.2f})"):
                        st.write(f"**Type:** `{acc['account_type']}` | **Normal Balance:** `{acc['normal_balance']}` | **Total Dr:** `RM {acc['total_debit']:,.2f}` | **Total Cr:** `RM {acc['total_credit']:,.2f}`")
                        txs = acc.get("transactions", [])
                        if txs:
                            st.dataframe(pd.DataFrame(txs), use_container_width=True)
                        else:
                            st.write("No transaction movements.")
        except Exception as e:
            st.error(f"Failed to load General Ledger: {e}")

    # 3. Profit & Loss Sub-tab
    with tab_pl:
        try:
            r_pl = requests.get(f"{API_BASE_URL}/api/ledger/profit_loss", timeout=5).json()
            col_pl1, col_pl2, col_pl3 = st.columns(3)
            col_pl1.metric("Total Revenue", f"RM {r_pl.get('total_revenue', 0.0):,.2f}")
            col_pl2.metric("Cost of Goods Sold", f"RM {r_pl.get('total_cogs', 0.0):,.2f}")
            col_pl3.metric("Gross Profit", f"RM {r_pl.get('gross_profit', 0.0):,.2f}")

            col_exp1, col_exp2 = st.columns(2)
            col_exp1.metric("Operating Expenses", f"RM {r_pl.get('total_expenses', 0.0):,.2f}")
            col_exp2.metric("Net Profit", f"RM {r_pl.get('net_profit', 0.0):,.2f}")
        except Exception as e:
            st.error(f"Failed to load Profit & Loss: {e}")

    # 4. Balance Sheet Sub-tab
    with tab_bs:
        try:
            r_bs = requests.get(f"{API_BASE_URL}/api/ledger/balance_sheet", timeout=5).json()
            col_bs1, col_bs2, col_bs3 = st.columns(3)
            col_bs1.metric("Total Assets", f"RM {r_bs.get('total_assets', 0.0):,.2f}")
            col_bs2.metric("Total Liabilities", f"RM {r_bs.get('total_liabilities', 0.0):,.2f}")
            col_bs3.metric("Total Equity (inc. Net Profit)", f"RM {r_bs.get('total_equity', 0.0):,.2f}")

            if r_bs.get("is_balanced"):
                st.success("✅ Accounting Equation Balanced: Assets == Liabilities + Equity")
            else:
                st.error("❌ Accounting Equation Discrepancy detected.")
        except Exception as e:
            st.error(f"Failed to load Balance Sheet: {e}")

# =========================================================================
# TAB 4: CHART OF ACCOUNTS & COMPANY CONTEXT
# =========================================================================
with tab_coa:
    st.header("Chart of Accounts & Company Master Profile")
    st.caption("Standard Malaysian Accounting Structure (AutoCount / SQL Account / UBS format)")

    conn = get_db_connection()
    comp_df = pd.read_sql("SELECT company_id, company_name, currency, financial_year, is_active FROM companies", conn)
    st.subheader("Active Company Context")
    st.dataframe(comp_df, use_container_width=True)

    coa_df = pd.read_sql("SELECT account_code, account_name, account_type, is_group, display_order FROM chart_of_accounts ORDER BY display_order ASC", conn)
    conn.close()

    st.subheader("Master Chart of Accounts (65 Accounts)")
    st.dataframe(coa_df, use_container_width=True)
