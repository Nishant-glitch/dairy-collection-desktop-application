package com.dcspro.society;

import android.content.Context;
import android.print.PrintAttributes;
import android.print.PrintDocumentAdapter;
import android.print.PrintManager;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Printing for the Android app. Android's WebView does not implement
 * window.print() (it is a silent no-op), so every web print path is routed
 * here by src/native/index.ts:
 *
 *  - printHtml: renders a standalone HTML document (thermal milk slip,
 *    repayment receipt, QR posters) in an offscreen WebView and hands it to
 *    the system print dialog.
 *  - printPage: prints the live app WebView itself, honouring its
 *    `@media print` CSS (Reports, Cash Book, Deductions, BMC bill).
 *
 * The system dialog can save as PDF, print over Wi-Fi, or — with a print
 * service such as RawBT installed — print to a Bluetooth ESC/POS thermal
 * printer.
 */
@CapacitorPlugin(name = "DcsPrint")
public class DcsPrintPlugin extends Plugin {

    // Strong reference: an offscreen WebView with no parent can be garbage
    // collected before its page finishes loading. Released once printing starts.
    private WebView pendingWebView;

    @PluginMethod
    public void printHtml(PluginCall call) {
        final String html = call.getString("html");
        final String jobName = call.getString("jobName", "DCS Pro");
        if (html == null || html.isEmpty()) {
            call.reject("html is required");
            return;
        }
        getActivity().runOnUiThread(() -> {
            WebView webView = new WebView(getActivity());
            webView.setWebViewClient(new WebViewClient() {
                private boolean started = false;

                @Override
                public void onPageFinished(WebView view, String url) {
                    if (started) return; // onPageFinished can fire more than once
                    started = true;
                    try {
                        startPrint(view, jobName);
                        call.resolve();
                    } catch (Exception e) {
                        call.reject("Print failed: " + e.getMessage(), e);
                    } finally {
                        pendingWebView = null;
                    }
                }
            });
            pendingWebView = webView;
            // Base URL keeps relative assets/fonts resolvable; the slips are
            // fully inline so nothing is actually fetched.
            webView.loadDataWithBaseURL("https://dcpro.online/", html, "text/html", "UTF-8", null);
        });
    }

    @PluginMethod
    public void printPage(PluginCall call) {
        final String jobName = call.getString("jobName", "DCS Pro");
        getActivity().runOnUiThread(() -> {
            try {
                startPrint(getBridge().getWebView(), jobName);
                call.resolve();
            } catch (Exception e) {
                call.reject("Print failed: " + e.getMessage(), e);
            }
        });
    }

    private void startPrint(WebView webView, String jobName) {
        PrintManager printManager = (PrintManager) getActivity().getSystemService(Context.PRINT_SERVICE);
        PrintDocumentAdapter adapter = webView.createPrintDocumentAdapter(jobName);
        printManager.print(jobName, adapter, new PrintAttributes.Builder().build());
    }
}
