
import js from "@eslint/js";
import globals from "globals";

const sharedBrowserGlobals = {
    GRADES: "readonly",
    SECTIONS: "readonly",
    current_section: "readonly",
    section_query: "readonly",
    page_url: "readonly",
    API_BASE_URL: "readonly",
    resolve_api_url: "readonly",
    api_request: "readonly",
    api_request_all: "readonly",
    create_element: "readonly",
    show_message: "readonly",
    build_site_header: "readonly",
    today_string: "readonly",
    date_from_text: "readonly",
    format_date: "readonly",
    session_title: "readonly",
    get_id_from_url: "readonly",
    make_grade_chip: "readonly",
    entry_text: "readonly",
    make_entry_cell: "readonly",
    build_entry_editor: "readonly",
    fill_select: "readonly",
    text_items: "readonly",
    delete_session_with_confirm: "readonly"
};

export default [
    {
        ignores: [
            "node_modules/**",
            "coverage/**",
            "dist/**"
        ]
    },

    // ملف api.js: يحتوي على تعريف الدوال المشتركة
    {
        files: ["public/js/api.js"],

        languageOptions: {
            ecmaVersion: "latest",
            sourceType: "script",
            globals: globals.browser
        },

        rules: {
            ...js.configs.recommended.rules,

            "no-unused-vars": [
                "warn",
                {
                    argsIgnorePattern: "^_",
                    varsIgnorePattern: "^_"
                }
            ],

            "no-console": "off"
        }
    },

    // ملفات صفحات المتصفح: تستخدم الدوال الموجودة في api.js
    {
        files: [
            "public/js/dashboard.js",
            "public/js/fields.js",
            "public/js/session-details.js",
            "public/js/session-report.js",
            "public/js/sessions.js",
            "public/js/students.js"
        ],

        languageOptions: {
            ecmaVersion: "latest",
            sourceType: "script",

            globals: {
                ...globals.browser,
                ...sharedBrowserGlobals
            }
        },

        rules: {
            ...js.configs.recommended.rules,

            "no-unused-vars": [
                "warn",
                {
                    argsIgnorePattern: "^_",
                    varsIgnorePattern: "^_"
                }
            ],

            "no-console": "off"
        }
    },

    // Backend and tests
    {
        files: [
            "src/**/*.js",
            "tests/**/*.js"
        ],

        languageOptions: {
            ecmaVersion: "latest",
            sourceType: "commonjs",

            globals: {
                ...globals.node,
                ...globals.jest
            }
        },

        rules: {
            ...js.configs.recommended.rules,

            "no-unused-vars": [
                "warn",
                {
                    argsIgnorePattern: "^_",
                    varsIgnorePattern: "^_"
                }
            ],

            "no-console": "off"
        }
    }
];
