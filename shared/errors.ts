export type AppErrorCode =
  | 'RESUME_EMPTY'
  | 'RESUME_UNSUPPORTED'
  | 'RESUME_TOO_LARGE'
  | 'RESUME_PARSE_FAILED'
  | 'PROFILE_INVALID'
  | 'LLM_NOT_CONFIGURED'
  | 'LLM_KEY_MISSING'
  | 'LLM_PERMISSION_MISSING'
  | 'LLM_BAD_CONFIG'
  | 'LLM_AUTH'
  | 'LLM_RATE_LIMIT'
  | 'LLM_HTTP'
  | 'LLM_NETWORK'
  | 'LLM_TIMEOUT'
  | 'LLM_ABORTED'
  | 'LLM_BAD_OUTPUT';

export const ERROR_MESSAGES: Record<AppErrorCode, string> = {
  RESUME_EMPTY: '未识别到文字，请使用文字版 PDF / DOCX',
  RESUME_UNSUPPORTED: '文件类型不支持，请上传 PDF 或 DOCX',
  RESUME_TOO_LARGE: '文件超过 10 MB',
  RESUME_PARSE_FAILED: '简历文件解析失败',
  PROFILE_INVALID: '档案信息不完整',
  LLM_NOT_CONFIGURED: '请先在设置中配置模型',
  LLM_KEY_MISSING: 'API Key 未设置或已失效（浏览器重启后需重新输入）',
  LLM_PERMISSION_MISSING: '未授予 API 主机访问权限，请在设置中重新保存模型配置',
  LLM_BAD_CONFIG: '模型配置无效',
  LLM_AUTH: '验证失败，请检查 API Key 和权限',
  LLM_RATE_LIMIT: '请求受限，请稍后重试',
  LLM_HTTP: '模型服务返回错误',
  LLM_NETWORK: '网络错误，无法连接模型服务',
  LLM_TIMEOUT: '请求超时',
  LLM_ABORTED: '已取消',
  LLM_BAD_OUTPUT: '模型返回格式无效，请重试',
};

export class AppError extends Error {
  readonly code: AppErrorCode;
  constructor(code: AppErrorCode, message?: string) {
    super(message ?? ERROR_MESSAGES[code]);
    this.name = 'AppError';
    this.code = code;
  }
}

export function toAppError(err: unknown): AppError {
  if (err instanceof AppError) return err;
  if (err instanceof Error) return new AppError('LLM_NETWORK', err.message);
  return new AppError('LLM_NETWORK', String(err));
}

/** 在展示错误前移除可能混入的密钥字符串。 */
export function redactSecret(text: string, secret: string | undefined | null): string {
  if (!secret || secret.length < 4) return text;
  return text.split(secret).join('***');
}
