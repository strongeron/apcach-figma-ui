flowchart TD
    A[Figma Node Selected] --> B[detectBackgroundColor Function]
    B --> C{Check Siblings Behind Target}
    C -->|Background Found| D[Convert to RGB in 0-255 Range]
    C -->|No Background| E{Check Direct Parent Container}
    E -->|Background Found| D
    E -->|No Background| F{Check Intersecting Nodes}
    F --> G[findIntersectingNodesBelow]
    G --> H[Sort Nodes by Z-index]
    H --> I{Check Each Node Has Valid Fill}
    I -->|Background Found| D
    I -->|No Background| J{Check Parents of Intersecting Nodes}
    J -->|Background Found| D
    J -->|No Background| K[getPageBackground]
    K -->|Background Found| D
    K -->|No Background| L[Use Fallback Dark Background #1E1E1E]
    L --> D
    
    D --> M[Send Background to UI via postMessage]
    M --> N[UI Receives Background in Message Handler]
    N --> O[updateBackgroundColor Function]
    O --> P[Store in currentBackground Variable]
    P --> Q[Update UI Colors]
    Q --> R[Generate Dynamic Colors]
    R --> S[Apply Dynamic Colors to UI]
    S --> T[Recalculate Color with New Background]
    T --> U[Update Background Color Input]
    U --> V[Update Max Chroma Info]