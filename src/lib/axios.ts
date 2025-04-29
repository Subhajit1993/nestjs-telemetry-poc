import axios, { AxiosRequestHeaders } from 'axios';
import { context, propagation, trace } from '@opentelemetry/api';

// Create axios instance
const axiosInstance = axios.create();

// Request interceptor
axiosInstance.interceptors.request.use((config) => {
  const currentContext = context.active();
  const currentSpan = trace.getSpan(currentContext);

  if (currentSpan) {
    // Create headers carrier
    const headers: Record<string, string> = {};

    // Inject current trace context
    propagation.inject(currentContext, headers);

    // Add headers to request config
    config.headers = {
      ...config.headers,
      ...headers,
    } as AxiosRequestHeaders;
  }

  return config;
});

export default axiosInstance;
