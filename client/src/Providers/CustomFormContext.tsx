import React, { createContext, PropsWithChildren, ReactElement, useContext, useMemo } from 'react';
import type { FieldValues, UseFormReturn } from 'react-hook-form';

interface FormContextValue<TFieldValues extends FieldValues> extends UseFormReturn<TFieldValues> {}

function createFormContext<TFieldValues extends FieldValues>() {
  const context = createContext<FormContextValue<TFieldValues> | undefined>(undefined);

  const useCustomFormContext = (): FormContextValue<TFieldValues> => {
    const value = useContext(context);
    if (!value) {
      throw new Error('useCustomFormContext must be used within a CustomFormProvider');
    }
    return value;
  };

  const CustomFormProvider = ({
    children,
    ...methods
  }: PropsWithChildren<FormContextValue<TFieldValues>>): ReactElement => {
    const value = useMemo(() => methods, [methods]);

    return <context.Provider value={value}>{children}</context.Provider>;
  };

  return { CustomFormProvider, useCustomFormContext };
}

export type { FormContextValue };
export { createFormContext };
