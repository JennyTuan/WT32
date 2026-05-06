import { buildApiUrl } from "./apiClient";

export type CornerItem = {
    key: string;
    label?: string;
    visible: boolean;
};

export type CornerConfigData = {
    corners: {
        topLeft: CornerItem[];
        topRight: CornerItem[];
        bottomLeft: CornerItem[];
        bottomRight: CornerItem[];
    };
};

export type ApiCornerConfig = {
    id: number;
    template_name: string;
    is_active: boolean;
    config_json: string;
    created_at: string;
    updated_at?: string;
};

export const fetchCornerConfig = async (): Promise<ApiCornerConfig> => {
    const response = await fetch(buildApiUrl("/api/corners/"));
    if (!response.ok) {
        throw new Error(`Failed to fetch corner config: ${response.status}`);
    }
    return response.json();
};

export const saveCornerConfig = async (configJson: string, templateName: string = "Custom"): Promise<ApiCornerConfig> => {
    const response = await fetch(buildApiUrl("/api/corners/"), {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
        },
        body: JSON.stringify({
            template_name: templateName,
            config_json: configJson,
        }),
    });
    if (!response.ok) {
        throw new Error(`Failed to save corner config: ${response.status}`);
    }
    return response.json();
};

export const resetCornerConfig = async (): Promise<ApiCornerConfig> => {
    const response = await fetch(buildApiUrl("/api/corners/reset"), {
        method: "POST",
    });
    if (!response.ok) {
        throw new Error(`Failed to reset corner config: ${response.status}`);
    }
    return response.json();
};
