/**
 * GitLab REST API v4 data types.
 */

export interface GitLabUser {
    id: number;
    username: string;
    name: string;
    state: string;
    avatar_url: string | null;
    web_url: string;
    created_at: string;
    bio?: string | null;
    location?: string | null;
    public_email?: string | null;
    website_url?: string | null;
}

export interface GitLabProject {
    id: number;
    name: string;
    name_with_namespace: string;
    path: string;
    path_with_namespace: string;
    created_at: string;
    default_branch?: string;
    visibility: 'public' | 'internal' | 'private';
    star_count: number;
    forks_count: number;
    archived: boolean;
    web_url: string;
    owner?: {
        id: number;
        username: string;
    };
    namespace?: {
        id: number;
        name: string;
        path: string;
        kind: string;
    };
}

export interface GitLabPushData {
    commit_count: number;
    action: string;
    ref_type: string;
    commit_from?: string | null;
    commit_to?: string | null;
    ref?: string | null;
    commit_title?: string | null;
}

export interface GitLabEvent {
    id: number;
    project_id: number;
    action_name: string;
    target_id: number | null;
    target_type: string | null;
    author_id: number;
    created_at: string;
    push_data?: GitLabPushData;
}

export interface GitLabMergeRequest {
    id: number;
    iid: number;
    project_id: number;
    title: string;
    created_at: string;
    author: {
        id: number;
        username: string;
    };
}

export interface GitLabIssue {
    id: number;
    iid: number;
    project_id: number;
    title: string;
    created_at: string;
    author: {
        id: number;
        username: string;
    };
}

export type GitLabLanguagesResponse = Record<string, number>;
