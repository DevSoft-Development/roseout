import "react";

declare module "react" {
  interface DetailsHTMLAttributes<T> {
    /**
     * Compatibility typing for the existing short-links advanced-options panel.
     * React forwards this boolean to the native details element at runtime.
     */
    defaultOpen?: boolean;
  }
}
