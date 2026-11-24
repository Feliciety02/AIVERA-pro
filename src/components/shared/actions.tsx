/**
 * The standard buttons for creating, changing and removing records. Every page uses these, so
 * "Add" always looks like "Add" and "Delete" always looks like "Delete":
 *
 *   Add / New   solid primary, plus icon       (the main thing to do on a list)
 *   Edit        outline, pencil
 *   Archive     outline, archive box           (reversible)
 *   Restore     outline, circular arrow
 *   Delete      red outline, bin               (permanent; pair it with a ConfirmDialog)
 *
 * Labels say what is being made: "New project" for a new record, "Add website" when it goes into
 * something that already exists. Pass `to` for a link, or `onClick` for an action.
 */
import * as React from "react";
import { Link } from "react-router";
import { Archive, Pencil, Plus, RotateCcw, Trash2, type LucideIcon } from "lucide-react";
import { Button, type ButtonProps } from "@/components/ui/button";

interface ActionButtonProps {
  children?: React.ReactNode;
  /** Makes the button a link. */
  to?: string;
  onClick?: () => void;
  disabled?: boolean;
  className?: string;
}

function actionButton(icon: LucideIcon, variant: ButtonProps["variant"], fallback: string) {
  const Icon = icon;
  function ActionButton({ children, to, onClick, disabled, className }: ActionButtonProps) {
    const content = (
      <>
        <Icon aria-hidden /> {children ?? fallback}
      </>
    );
    if (to && !disabled)
      return (
        <Button variant={variant} className={className} asChild>
          <Link to={to}>{content}</Link>
        </Button>
      );
    return (
      <Button variant={variant} className={className} onClick={onClick} disabled={disabled}>
        {content}
      </Button>
    );
  }
  ActionButton.displayName = `${fallback}Button`;
  return ActionButton;
}

export const AddButton = actionButton(Plus, "default", "Add");
export const EditButton = actionButton(Pencil, "outline", "Edit");
export const ArchiveButton = actionButton(Archive, "outline", "Archive");
export const RestoreButton = actionButton(RotateCcw, "outline", "Restore");
export const DeleteButton = actionButton(Trash2, "destructive-outline", "Delete");
