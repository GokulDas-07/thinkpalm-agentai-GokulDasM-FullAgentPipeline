import { prettifyError, z } from "zod";

/**
 * Output shape of {@link ComponentNodeSchema} (explicit alias so `z.lazy` is type-checkable under TS).
 */
type ComponentNodeBase = {
  /** Stable unique identifier for this node within the tree. */
  id: string;
  /** PascalCase component name (for example "Navbar", "HeroSection"). */
  name: string;
  /** High-level category describing how this component is used. */
  type: "layout" | "section" | "ui" | "form" | "data";
  /** Human-readable summary of what this component represents or does. */
  description: string;
  /** Declared props for this component instance. */
  props: {
    /** Prop name as exposed to consumers or in JSX. */
    name: string;
    /** TypeScript-style or conceptual type of the prop (for example "string", "ReactNode"). */
    type: string;
    /** Whether callers must supply this prop. */
    required: boolean;
    /** Optional serialized default when the prop is omitted. */
    defaultValue?: string;
  }[];
  /** Tailwind CSS utility classes applied to this component's root element. */
  tailwindClasses: string[];
  /** Optional nested child components under this node. */
  children?: ComponentNodeBase[];
  /** Optional generated TSX source for this node (filled in a later pipeline stage). */
  code?: string;
};

/**
 * Recursive schema for a single component node in the UI tree.
 * `children` is defined with `z.lazy()` to support arbitrary nesting depth.
 */
const componentNodeSchema: z.ZodType<ComponentNodeBase> = z.lazy(() =>
  z.object({
    /** Stable unique identifier for this node within the tree. */
    id: z.string(),
    /** PascalCase component name (for example "Navbar", "HeroSection"). */
    name: z.string(),
    /** High-level category describing how this component is used. */
    type: z.enum(["layout", "section", "ui", "form", "data"]),
    /** Human-readable summary of what this component represents or does. */
    description: z.string(),
    /** Declared props for this component instance. */
    props: z.array(
      z.object({
        /** Prop name as exposed to consumers or in JSX. */
        name: z.string(),
        /** TypeScript-style or conceptual type of the prop (for example "string", "ReactNode"). */
        type: z.string(),
        /** Whether callers must supply this prop. */
        required: z.boolean(),
        /** Optional serialized default when the prop is omitted. */
        defaultValue: z.string().optional(),
      }),
    ),
    /** Tailwind CSS utility classes applied to this component's root element. */
    tailwindClasses: z.union([
      z.array(z.string()),
      z.string().transform(s => s.split(' ').filter(Boolean))
    ]),
    /** Optional nested child components under this node. */
    children: z.array(componentNodeSchema).optional(),
    /** Optional generated TSX source for this node (filled in a later pipeline stage). */
    code: z.string().optional(),
  }),
);

export const ComponentNodeSchema = componentNodeSchema;

/**
 * Top-level document describing the page and its component hierarchy.
 */
export const ComponentTreeSchema = z.object({
  /** Short title for the page or screen being modeled. */
  pageTitle: z.string(),
  /** Longer description of the page's purpose and content. */
  pageDescription: z.string(),
  /** Target implementation stack for generated code. */
  techStack: z.object({
    /** Application framework (for example "next", "react"). */
    framework: z.string(),
    /** Styling approach or CSS framework (for example "tailwind"). */
    cssFramework: z.string(),
    /** Whether TypeScript should be used in generated sources. */
    typescript: z.boolean(),
  }),
  /** Top-level component nodes that form the page (typically layout roots). */
  rootComponents: z.array(ComponentNodeSchema),
});

export type ComponentNode = z.infer<typeof ComponentNodeSchema>;
export type ComponentTree = z.infer<typeof ComponentTreeSchema>;

/**
 * Validates unknown input against {@link ComponentTreeSchema} using `safeParse`.
 *
 * @param data - Raw JSON or parsed value to validate.
 * @returns Parsed tree on success, or a human-readable error string on failure.
 */
export function validateComponentTree(data: unknown): {
  success: boolean;
  data?: ComponentTree;
  error?: string;
} {
  const result = ComponentTreeSchema.safeParse(data);
  if (result.success) {
    return { success: true, data: result.data };
  }
  return { success: false, error: prettifyError(result.error) };
}

/**
 * Depth-first preorder flattening of one or more component roots into a single array.
 * Each node appears once; nested `children` are still present on each node.
 *
 * @param nodes - Roots to flatten (often `rootComponents` from a {@link ComponentTree}).
 * @returns All reachable nodes in preorder order.
 */
export function flattenTree(nodes: ComponentNode[]): ComponentNode[] {
  const out: ComponentNode[] = [];
  for (const node of nodes) {
    out.push(node);
    if (node.children?.length) {
      out.push(...flattenTree(node.children));
    }
  }
  return out;
}
