flowchart TB
    A[User Action/Event] --> B{Type of Event}
    
    B -->|Slider Change| C[updateColorFromInputs]
    B -->|Direct Color Change| D[updateForegroundColor]
    B -->|Text Preview| E[updateColorPreviewForText]
    B -->|Color Preview| F[updateColorPreview]
    
    C --> G[Generate New Color]
    G --> H[recalculateColorWithBackground]
    H --> K[updateUI]
    
    D --> K
    E --> L[Update Text Preview UI]
    L --> M[updatePreviewInUI]
    F --> N[Update Color Preview]
    N --> M
    
    M --> O[Format Color]
    O --> P[Update Foreground Controls]
    
    P --> Q[Update fgColorInput]
    P --> R[Update fgColorValue]
    P --> S[Extract Color Properties]
    
    S --> T[Generate Dynamic Colors]
    T --> U[Create Preview Context]
    U --> V[updateColorValues]
    U --> W[applyDynamicColors]
    
    V --> X[Set CSS Variables on Document Root]
    V --> Y[Update Color-Values Container]
    V --> Z[Update APCA Row]
    V --> AA[Update APCA Description]
    
    W --> AB[Set CSS Variables]
    W --> AC[Update Button Background]
    
    subgraph "Foreground Control Update Flow"
        Q[Update Color Picker Input:
        fgColorInput.value = formattedColor]
        R[Update Hex Text:
        fgColorValue.textContent = upperCaseColor]
    end
    
    subgraph "CSS Variables Set"
        X[Document Root:
        --text-color
        --text-secondary
        --text-tertiary
        --border-strong
        --border-subtle
        --hover-overlay]
    end
    
    subgraph "Dynamic Variables Flow"
        S --> T1[Extract Background RGB Values]
        S --> T2[Extract Preview Hue from OKLCH]
        T1 --> T3[generateDynamicColors]
        T2 --> T3
        T3 --> V
        T3 --> W
    end