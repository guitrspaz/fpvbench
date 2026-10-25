/** Synthetic Betaflight 4.5.2 example, generated from full twenty-slot mode exports. No personal aircraft or observations. */
const comparison={
  "before": {
    "model": "dji-fpv-rc3",
    "revision": 0,
    "updatedAt": null,
    "complete": true,
    "reasons": [],
    "notices": [
      "6 import warnings are outside the mode rules; all 20 AUX slots were checked against the original export."
    ],
    "controls": [
      {
        "id": "flight-mode",
        "label": "Flight mode switch · N/S/M",
        "location": "Left shoulder",
        "suggestedAux": 1,
        "mapping": {
          "kind": "unknown",
          "aux": null,
          "positions": [],
          "note": "",
          "verified": false,
          "verifiedAt": null
        },
        "displayMapping": {
          "kind": "aux",
          "aux": 1,
          "positions": [],
          "note": "",
          "verified": false,
          "verifiedAt": null
        },
        "mappingSource": "suggested",
        "assignment": "assigned",
        "verified": false,
        "behaviors": [
          "Arm/disarm request"
        ],
        "rules": [
          {
            "mode": 0,
            "aux": 1,
            "start": 1700,
            "end": 2100,
            "logic": 0,
            "linked": 0,
            "label": "Arm/disarm request",
            "line": 7,
            "source": "aux 0 0 0 1700 2100 0 0"
          }
        ],
        "positions": []
      },
      {
        "id": "c2",
        "label": "C2 switch",
        "location": "Right shoulder",
        "suggestedAux": 2,
        "mapping": {
          "kind": "unknown",
          "aux": null,
          "positions": [],
          "note": "",
          "verified": false,
          "verifiedAt": null
        },
        "displayMapping": {
          "kind": "aux",
          "aux": 2,
          "positions": [],
          "note": "",
          "verified": false,
          "verifiedAt": null
        },
        "mappingSource": "suggested",
        "assignment": "assigned",
        "verified": false,
        "behaviors": [
          "Angle mode"
        ],
        "rules": [
          {
            "mode": 1,
            "aux": 2,
            "start": 900,
            "end": 2100,
            "logic": 0,
            "linked": 0,
            "label": "Angle mode",
            "line": 8,
            "source": "aux 1 1 1 900 2100 0 0"
          }
        ],
        "positions": []
      },
      {
        "id": "pause-rth",
        "label": "Pause / RTH",
        "location": "Left shoulder",
        "suggestedAux": 3,
        "mapping": {
          "kind": "unknown",
          "aux": null,
          "positions": [],
          "note": "",
          "verified": false,
          "verifiedAt": null
        },
        "displayMapping": {
          "kind": "aux",
          "aux": 3,
          "positions": [],
          "note": "",
          "verified": false,
          "verifiedAt": null
        },
        "mappingSource": "suggested",
        "assignment": "unassigned",
        "verified": false,
        "behaviors": [],
        "rules": [],
        "positions": []
      },
      {
        "id": "start-stop",
        "label": "Start / Stop",
        "location": "Right shoulder",
        "suggestedAux": 4,
        "mapping": {
          "kind": "unknown",
          "aux": null,
          "positions": [],
          "note": "",
          "verified": false,
          "verifiedAt": null
        },
        "displayMapping": {
          "kind": "aux",
          "aux": 4,
          "positions": [],
          "note": "",
          "verified": false,
          "verifiedAt": null
        },
        "mappingSource": "suggested",
        "assignment": "unassigned",
        "verified": false,
        "behaviors": [],
        "rules": [],
        "positions": []
      },
      {
        "id": "c1",
        "label": "C1 button",
        "location": "Front left",
        "suggestedAux": 5,
        "mapping": {
          "kind": "unknown",
          "aux": null,
          "positions": [],
          "note": "",
          "verified": false,
          "verifiedAt": null
        },
        "displayMapping": {
          "kind": "aux",
          "aux": 5,
          "positions": [],
          "note": "",
          "verified": false,
          "verifiedAt": null
        },
        "mappingSource": "suggested",
        "assignment": "unassigned",
        "verified": false,
        "behaviors": [],
        "rules": [],
        "positions": []
      },
      {
        "id": "gimbal",
        "label": "Gimbal dial",
        "location": "Left shoulder",
        "mapping": {
          "kind": "unknown",
          "aux": null,
          "positions": [],
          "note": "",
          "verified": false,
          "verifiedAt": null
        },
        "displayMapping": {
          "kind": "unknown",
          "aux": null,
          "positions": [],
          "note": "",
          "verified": false,
          "verifiedAt": null
        },
        "mappingSource": "unknown",
        "assignment": "unknown",
        "verified": false,
        "behaviors": [],
        "rules": [],
        "positions": []
      },
      {
        "id": "shutter",
        "label": "Shutter / Record",
        "location": "Right shoulder",
        "mapping": {
          "kind": "unknown",
          "aux": null,
          "positions": [],
          "note": "",
          "verified": false,
          "verifiedAt": null
        },
        "displayMapping": {
          "kind": "unknown",
          "aux": null,
          "positions": [],
          "note": "",
          "verified": false,
          "verifiedAt": null
        },
        "mappingSource": "unknown",
        "assignment": "unknown",
        "verified": false,
        "behaviors": [],
        "rules": [],
        "positions": []
      },
      {
        "id": "power",
        "label": "Power button",
        "location": "Front center",
        "mapping": {
          "kind": "unknown",
          "aux": null,
          "positions": [],
          "note": "",
          "verified": false,
          "verifiedAt": null
        },
        "displayMapping": {
          "kind": "external",
          "aux": null,
          "positions": [],
          "note": "Controller power",
          "verified": false,
          "verifiedAt": null
        },
        "mappingSource": "documented",
        "assignment": "external",
        "verified": false,
        "behaviors": [],
        "rules": [],
        "positions": []
      }
    ],
    "channels": [
      {
        "aux": 1,
        "behaviors": [
          "Arm/disarm request"
        ],
        "rules": [
          {
            "mode": 0,
            "aux": 1,
            "start": 1700,
            "end": 2100,
            "logic": 0,
            "linked": 0,
            "label": "Arm/disarm request",
            "line": 7,
            "source": "aux 0 0 0 1700 2100 0 0"
          }
        ]
      },
      {
        "aux": 2,
        "behaviors": [
          "Angle mode"
        ],
        "rules": [
          {
            "mode": 1,
            "aux": 2,
            "start": 900,
            "end": 2100,
            "logic": 0,
            "linked": 0,
            "label": "Angle mode",
            "line": 8,
            "source": "aux 1 1 1 900 2100 0 0"
          }
        ]
      },
      {
        "aux": 3,
        "behaviors": [],
        "rules": []
      },
      {
        "aux": 4,
        "behaviors": [],
        "rules": []
      },
      {
        "aux": 5,
        "behaviors": [],
        "rules": []
      },
      {
        "aux": 6,
        "behaviors": [],
        "rules": []
      },
      {
        "aux": 7,
        "behaviors": [],
        "rules": []
      },
      {
        "aux": 8,
        "behaviors": [],
        "rules": []
      },
      {
        "aux": 9,
        "behaviors": [],
        "rules": []
      },
      {
        "aux": 10,
        "behaviors": [],
        "rules": []
      },
      {
        "aux": 11,
        "behaviors": [],
        "rules": []
      },
      {
        "aux": 12,
        "behaviors": [],
        "rules": []
      },
      {
        "aux": 13,
        "behaviors": [],
        "rules": []
      },
      {
        "aux": 14,
        "behaviors": [],
        "rules": []
      }
    ]
  },
  "after": {
    "model": "dji-fpv-rc3",
    "revision": 0,
    "updatedAt": null,
    "complete": true,
    "reasons": [],
    "notices": [
      "6 import warnings are outside the mode rules; all 20 AUX slots were checked against the original export."
    ],
    "controls": [
      {
        "id": "flight-mode",
        "label": "Flight mode switch · N/S/M",
        "location": "Left shoulder",
        "suggestedAux": 1,
        "mapping": {
          "kind": "unknown",
          "aux": null,
          "positions": [],
          "note": "",
          "verified": false,
          "verifiedAt": null
        },
        "displayMapping": {
          "kind": "aux",
          "aux": 1,
          "positions": [],
          "note": "",
          "verified": false,
          "verifiedAt": null
        },
        "mappingSource": "suggested",
        "assignment": "assigned",
        "verified": false,
        "behaviors": [
          "Angle mode"
        ],
        "rules": [
          {
            "mode": 1,
            "aux": 1,
            "start": 900,
            "end": 1700,
            "logic": 0,
            "linked": 0,
            "label": "Angle mode",
            "line": 8,
            "source": "aux 1 1 0 900 1700 0 0"
          }
        ],
        "positions": []
      },
      {
        "id": "c2",
        "label": "C2 switch",
        "location": "Right shoulder",
        "suggestedAux": 2,
        "mapping": {
          "kind": "unknown",
          "aux": null,
          "positions": [],
          "note": "",
          "verified": false,
          "verifiedAt": null
        },
        "displayMapping": {
          "kind": "aux",
          "aux": 2,
          "positions": [],
          "note": "",
          "verified": false,
          "verifiedAt": null
        },
        "mappingSource": "suggested",
        "assignment": "assigned",
        "verified": false,
        "behaviors": [
          "Turtle mode",
          "Prearm"
        ],
        "rules": [
          {
            "mode": 35,
            "aux": 2,
            "start": 1700,
            "end": 2100,
            "logic": 0,
            "linked": 0,
            "label": "Turtle mode",
            "line": 10,
            "source": "aux 3 35 1 1700 2100 0 0"
          },
          {
            "mode": 36,
            "aux": 2,
            "start": 1300,
            "end": 2100,
            "logic": 0,
            "linked": 0,
            "label": "Prearm",
            "line": 11,
            "source": "aux 4 36 1 1300 2100 0 0"
          }
        ],
        "positions": []
      },
      {
        "id": "pause-rth",
        "label": "Pause / RTH",
        "location": "Left shoulder",
        "suggestedAux": 3,
        "mapping": {
          "kind": "unknown",
          "aux": null,
          "positions": [],
          "note": "",
          "verified": false,
          "verifiedAt": null
        },
        "displayMapping": {
          "kind": "aux",
          "aux": 3,
          "positions": [],
          "note": "",
          "verified": false,
          "verifiedAt": null
        },
        "mappingSource": "suggested",
        "assignment": "unassigned",
        "verified": false,
        "behaviors": [],
        "rules": [],
        "positions": []
      },
      {
        "id": "start-stop",
        "label": "Start / Stop",
        "location": "Right shoulder",
        "suggestedAux": 4,
        "mapping": {
          "kind": "unknown",
          "aux": null,
          "positions": [],
          "note": "",
          "verified": false,
          "verifiedAt": null
        },
        "displayMapping": {
          "kind": "aux",
          "aux": 4,
          "positions": [],
          "note": "",
          "verified": false,
          "verifiedAt": null
        },
        "mappingSource": "suggested",
        "assignment": "assigned",
        "verified": false,
        "behaviors": [
          "Arm/disarm request"
        ],
        "rules": [
          {
            "mode": 0,
            "aux": 4,
            "start": 1700,
            "end": 2100,
            "logic": 0,
            "linked": 0,
            "label": "Arm/disarm request",
            "line": 7,
            "source": "aux 0 0 3 1700 2100 0 0"
          }
        ],
        "positions": []
      },
      {
        "id": "c1",
        "label": "C1 button",
        "location": "Front left",
        "suggestedAux": 5,
        "mapping": {
          "kind": "unknown",
          "aux": null,
          "positions": [],
          "note": "",
          "verified": false,
          "verifiedAt": null
        },
        "displayMapping": {
          "kind": "aux",
          "aux": 5,
          "positions": [],
          "note": "",
          "verified": false,
          "verifiedAt": null
        },
        "mappingSource": "suggested",
        "assignment": "assigned",
        "verified": false,
        "behaviors": [
          "Beeper"
        ],
        "rules": [
          {
            "mode": 13,
            "aux": 5,
            "start": 1700,
            "end": 2100,
            "logic": 0,
            "linked": 0,
            "label": "Beeper",
            "line": 9,
            "source": "aux 2 13 4 1700 2100 0 0"
          }
        ],
        "positions": []
      },
      {
        "id": "gimbal",
        "label": "Gimbal dial",
        "location": "Left shoulder",
        "mapping": {
          "kind": "unknown",
          "aux": null,
          "positions": [],
          "note": "",
          "verified": false,
          "verifiedAt": null
        },
        "displayMapping": {
          "kind": "unknown",
          "aux": null,
          "positions": [],
          "note": "",
          "verified": false,
          "verifiedAt": null
        },
        "mappingSource": "unknown",
        "assignment": "unknown",
        "verified": false,
        "behaviors": [],
        "rules": [],
        "positions": []
      },
      {
        "id": "shutter",
        "label": "Shutter / Record",
        "location": "Right shoulder",
        "mapping": {
          "kind": "unknown",
          "aux": null,
          "positions": [],
          "note": "",
          "verified": false,
          "verifiedAt": null
        },
        "displayMapping": {
          "kind": "unknown",
          "aux": null,
          "positions": [],
          "note": "",
          "verified": false,
          "verifiedAt": null
        },
        "mappingSource": "unknown",
        "assignment": "unknown",
        "verified": false,
        "behaviors": [],
        "rules": [],
        "positions": []
      },
      {
        "id": "power",
        "label": "Power button",
        "location": "Front center",
        "mapping": {
          "kind": "unknown",
          "aux": null,
          "positions": [],
          "note": "",
          "verified": false,
          "verifiedAt": null
        },
        "displayMapping": {
          "kind": "external",
          "aux": null,
          "positions": [],
          "note": "Controller power",
          "verified": false,
          "verifiedAt": null
        },
        "mappingSource": "documented",
        "assignment": "external",
        "verified": false,
        "behaviors": [],
        "rules": [],
        "positions": []
      }
    ],
    "channels": [
      {
        "aux": 1,
        "behaviors": [
          "Angle mode"
        ],
        "rules": [
          {
            "mode": 1,
            "aux": 1,
            "start": 900,
            "end": 1700,
            "logic": 0,
            "linked": 0,
            "label": "Angle mode",
            "line": 8,
            "source": "aux 1 1 0 900 1700 0 0"
          }
        ]
      },
      {
        "aux": 2,
        "behaviors": [
          "Turtle mode",
          "Prearm"
        ],
        "rules": [
          {
            "mode": 35,
            "aux": 2,
            "start": 1700,
            "end": 2100,
            "logic": 0,
            "linked": 0,
            "label": "Turtle mode",
            "line": 10,
            "source": "aux 3 35 1 1700 2100 0 0"
          },
          {
            "mode": 36,
            "aux": 2,
            "start": 1300,
            "end": 2100,
            "logic": 0,
            "linked": 0,
            "label": "Prearm",
            "line": 11,
            "source": "aux 4 36 1 1300 2100 0 0"
          }
        ]
      },
      {
        "aux": 3,
        "behaviors": [],
        "rules": []
      },
      {
        "aux": 4,
        "behaviors": [
          "Arm/disarm request"
        ],
        "rules": [
          {
            "mode": 0,
            "aux": 4,
            "start": 1700,
            "end": 2100,
            "logic": 0,
            "linked": 0,
            "label": "Arm/disarm request",
            "line": 7,
            "source": "aux 0 0 3 1700 2100 0 0"
          }
        ]
      },
      {
        "aux": 5,
        "behaviors": [
          "Beeper"
        ],
        "rules": [
          {
            "mode": 13,
            "aux": 5,
            "start": 1700,
            "end": 2100,
            "logic": 0,
            "linked": 0,
            "label": "Beeper",
            "line": 9,
            "source": "aux 2 13 4 1700 2100 0 0"
          }
        ]
      },
      {
        "aux": 6,
        "behaviors": [],
        "rules": []
      },
      {
        "aux": 7,
        "behaviors": [],
        "rules": []
      },
      {
        "aux": 8,
        "behaviors": [],
        "rules": []
      },
      {
        "aux": 9,
        "behaviors": [],
        "rules": []
      },
      {
        "aux": 10,
        "behaviors": [],
        "rules": []
      },
      {
        "aux": 11,
        "behaviors": [],
        "rules": []
      },
      {
        "aux": 12,
        "behaviors": [],
        "rules": []
      },
      {
        "aux": 13,
        "behaviors": [],
        "rules": []
      },
      {
        "aux": 14,
        "behaviors": [],
        "rules": []
      }
    ]
  },
  "channels": [
    {
      "aux": 1,
      "before": [
        "Arm/disarm request"
      ],
      "after": [
        "Angle mode"
      ],
      "beforeRules": [
        {
          "mode": 0,
          "aux": 1,
          "start": 1700,
          "end": 2100,
          "logic": 0,
          "linked": 0,
          "label": "Arm/disarm request",
          "line": 7,
          "source": "aux 0 0 0 1700 2100 0 0"
        }
      ],
      "afterRules": [
        {
          "mode": 1,
          "aux": 1,
          "start": 900,
          "end": 1700,
          "logic": 0,
          "linked": 0,
          "label": "Angle mode",
          "line": 8,
          "source": "aux 1 1 0 900 1700 0 0"
        }
      ],
      "change": "changed"
    },
    {
      "aux": 2,
      "before": [
        "Angle mode"
      ],
      "after": [
        "Turtle mode",
        "Prearm"
      ],
      "beforeRules": [
        {
          "mode": 1,
          "aux": 2,
          "start": 900,
          "end": 2100,
          "logic": 0,
          "linked": 0,
          "label": "Angle mode",
          "line": 8,
          "source": "aux 1 1 1 900 2100 0 0"
        }
      ],
      "afterRules": [
        {
          "mode": 35,
          "aux": 2,
          "start": 1700,
          "end": 2100,
          "logic": 0,
          "linked": 0,
          "label": "Turtle mode",
          "line": 10,
          "source": "aux 3 35 1 1700 2100 0 0"
        },
        {
          "mode": 36,
          "aux": 2,
          "start": 1300,
          "end": 2100,
          "logic": 0,
          "linked": 0,
          "label": "Prearm",
          "line": 11,
          "source": "aux 4 36 1 1300 2100 0 0"
        }
      ],
      "change": "changed"
    },
    {
      "aux": 3,
      "before": [],
      "after": [],
      "beforeRules": [],
      "afterRules": [],
      "change": "unchanged"
    },
    {
      "aux": 4,
      "before": [],
      "after": [
        "Arm/disarm request"
      ],
      "beforeRules": [],
      "afterRules": [
        {
          "mode": 0,
          "aux": 4,
          "start": 1700,
          "end": 2100,
          "logic": 0,
          "linked": 0,
          "label": "Arm/disarm request",
          "line": 7,
          "source": "aux 0 0 3 1700 2100 0 0"
        }
      ],
      "change": "changed"
    },
    {
      "aux": 5,
      "before": [],
      "after": [
        "Beeper"
      ],
      "beforeRules": [],
      "afterRules": [
        {
          "mode": 13,
          "aux": 5,
          "start": 1700,
          "end": 2100,
          "logic": 0,
          "linked": 0,
          "label": "Beeper",
          "line": 9,
          "source": "aux 2 13 4 1700 2100 0 0"
        }
      ],
      "change": "changed"
    },
    {
      "aux": 6,
      "before": [],
      "after": [],
      "beforeRules": [],
      "afterRules": [],
      "change": "unchanged"
    },
    {
      "aux": 7,
      "before": [],
      "after": [],
      "beforeRules": [],
      "afterRules": [],
      "change": "unchanged"
    },
    {
      "aux": 8,
      "before": [],
      "after": [],
      "beforeRules": [],
      "afterRules": [],
      "change": "unchanged"
    },
    {
      "aux": 9,
      "before": [],
      "after": [],
      "beforeRules": [],
      "afterRules": [],
      "change": "unchanged"
    },
    {
      "aux": 10,
      "before": [],
      "after": [],
      "beforeRules": [],
      "afterRules": [],
      "change": "unchanged"
    },
    {
      "aux": 11,
      "before": [],
      "after": [],
      "beforeRules": [],
      "afterRules": [],
      "change": "unchanged"
    },
    {
      "aux": 12,
      "before": [],
      "after": [],
      "beforeRules": [],
      "afterRules": [],
      "change": "unchanged"
    },
    {
      "aux": 13,
      "before": [],
      "after": [],
      "beforeRules": [],
      "afterRules": [],
      "change": "unchanged"
    },
    {
      "aux": 14,
      "before": [],
      "after": [],
      "beforeRules": [],
      "afterRules": [],
      "change": "unchanged"
    }
  ],
  "mappingChanges": [],
  "counts": {
    "changed": 4,
    "unknown": 0,
    "unchanged": 10
  },
  "reasons": []
};

/** A fresh read-only presentation fixture; never inserted into the workspace. */
export function demoControllerComparison() { return structuredClone(comparison); }
