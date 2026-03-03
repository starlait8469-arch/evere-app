// username을 Supabase용 이메일로 변환 (내부적으로만 사용)
export function usernameToEmail(username: string): string {
    return `${username.toLowerCase().trim()}@evere.app`;
}

export function emailToUsername(email: string): string {
    return email.replace("@evere.app", "");
}
