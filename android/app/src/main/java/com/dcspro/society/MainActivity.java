package com.dcspro.society;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Local (in-app) plugins must be registered before the bridge starts.
        registerPlugin(DcsPrintPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
